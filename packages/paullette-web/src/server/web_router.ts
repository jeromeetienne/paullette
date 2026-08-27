import Express from 'express';

import { type PermissionDecision } from 'paullette-core/tools/tool_types';
import { type WebConversation } from './web_conversation.ts';
import { type WebEventStream } from './web_event_stream.ts';
import { WebStaticFiles } from './web_static_files.ts';
import { type MessageRequestBody, type PermissionRequestBody } from './web_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebRouter — the Express router holding every route of the web interface
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The largest body the server reads from a browser. A message a person types is short, and a body without a
 * limit is a way to make the server hold as much memory as the sender likes.
 */
const MAXIMUM_BODY_SIZE = '200kb';

/**
 * Every route of the web interface, as an Express router.
 *
 * The stream at `/api/events` is the one route that does not answer and end. It takes the answer over and holds
 * it open until the browser goes away. Everything else is a body written once.
 */
export class WebRouter {
	/** The conversation every browser shares. */
	private readonly _conversation: WebConversation;
	/** The open streams. */
	private readonly _eventStream: WebEventStream;

	/**
	 * Builds the router.
	 *
	 * @param conversation The conversation every browser shares.
	 * @param eventStream The open streams.
	 */
	constructor(conversation: WebConversation, eventStream: WebEventStream) {
		this._conversation = conversation;
		this._eventStream = eventStream;
	}

	/**
	 * Builds the Express router: the body reader, every route, the not found, and the last resort.
	 *
	 * Everything is in the one router rather than spread over the application, so that what the unit tests mount
	 * is the whole of what the server mounts.
	 *
	 * @returns The router to mount.
	 */
	build(): Express.Router {
		const router = Express.Router();

		router.use((request, response, next) => {
			response.set('cache-control', 'no-store');
			next();
		});

		router.use(
			Express.json({
				limit: MAXIMUM_BODY_SIZE,
				type: () => true,
			}),
		);
		router.use(WebRouter._answerBodyThatCouldNotBeRead);

		this._addStreamRoute(router);
		this._addStateRoutes(router);
		this._addTurnRoutes(router);
		WebRouter._addStaticFileRoutes(router);

		router.use(WebRouter._answerNotFound);
		router.use(WebRouter._answerCaughtError);

		return router;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Routes
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Adds the route that hands the request to the stream.
	 *
	 * @param router The router being built.
	 * @returns Nothing.
	 */
	private _addStreamRoute(router: Express.Router): void {
		router.get('/api/events', (request, response) => {
			this._eventStream.open(response);
		});
	}

	/**
	 * Adds the routes that only read: the state of the conversation and the past conversations.
	 *
	 * @param router The router being built.
	 * @returns Nothing.
	 */
	private _addStateRoutes(router: Express.Router): void {
		router.get('/api/state', (request, response) => {
			response.status(200).json(this._conversation.readState());
		});

		router.get('/api/sessions', (request, response) => {
			response.status(200).json({
				sessions: this._conversation.listSessions(),
			});
		});

		router.get('/api/sessions/:identifier', (request, response) => {
			const identifier = request.params.identifier;
			const messages = this._conversation.readSessionMessages(identifier);

			if (messages === null) {
				response.status(404).json({
					error: 'There is no such conversation.',
				});
				return;
			}

			response.status(200).json({
				identifier: identifier,
				messages: messages,
			});
		});
	}

	/**
	 * Adds the two routes a browser writes to: the one that starts a turn and the one that answers a question.
	 *
	 * @param router The router being built.
	 * @returns Nothing.
	 */
	private _addTurnRoutes(router: Express.Router): void {
		router.post('/api/message', (request, response) => {
			const body = request.body as MessageRequestBody | undefined;

			if (body === undefined || typeof body.message !== 'string') {
				response.status(400).json({
					error: 'The body must be an object holding a message, as text.',
				});
				return;
			}

			const outcome = this._conversation.sendMessage(body.message);

			if (outcome.isStarted === false) {
				response.status(409).json({
					error: outcome.refusedReason,
				});
				return;
			}

			response.status(202).json({
				started: true,
			});
		});

		router.post('/api/permission', (request, response) => {
			const body = request.body as (PermissionRequestBody & { isAlways?: boolean }) | undefined;

			if (body === undefined || typeof body.identifier !== 'string') {
				response.status(400).json({
					error: 'The body must be an object holding an identifier and a decision.',
				});
				return;
			}

			const decision: PermissionDecision = body.decision === 'allowed' ? 'allowed' : 'refused';
			const wasAnswered = this._conversation.answerPermission(
				body.identifier,
				decision,
				body.isAlways === true,
			);

			if (wasAnswered === false) {
				response.status(404).json({
					error: 'There is no question waiting under that identifier.',
				});
				return;
			}

			response.status(200).json({
				answered: true,
			});
		});
	}

	/**
	 * Adds one route for each file the browser may ask for.
	 *
	 * One whole path is registered per file, and `express.static` is never used, so that no path arriving from a
	 * web address is ever resolved against a folder. There is nothing to climb out of.
	 *
	 * @param router The router being built.
	 * @returns Nothing.
	 */
	private static _addStaticFileRoutes(router: Express.Router): void {
		for (const servedPath of WebStaticFiles.servedPaths()) {
			router.get(servedPath, (request, response, next) => {
				const staticFile = WebStaticFiles.read(servedPath);

				if (staticFile === null) {
					next();
					return;
				}

				response.status(200).type(staticFile.contentType).send(staticFile.content);
			});
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Answers That Are Not A Route
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Answers a body that is too long, or that is not JSON, with a sentence the sender can read.
	 *
	 * The body reader of Express throws rather than handing on a body it could not read. Without this the sender
	 * would be told nothing but a number, and the reason would be in the log of the server instead.
	 *
	 * @param caughtError What the body reader threw.
	 * @param request The request the browser made.
	 * @param response The answer being written.
	 * @param next The next handler. It is never called, and is declared because Express reads the number of
	 *   parameters to tell a handler of an error from an ordinary one.
	 * @returns Nothing.
	 */
	private static _answerBodyThatCouldNotBeRead(
		caughtError: Error,
		request: Express.Request,
		response: Express.Response,
		next: Express.NextFunction,
	): void {
		response.status(400).json({
			error: 'The body must be JSON, and no longer than 200kb.',
		});
	}

	/**
	 * Answers every address nothing is served at.
	 *
	 * @param request The request the browser made.
	 * @param response The answer being written.
	 * @returns Nothing.
	 */
	private static _answerNotFound(request: Express.Request, response: Express.Response): void {
		response.status(404).json({
			error: 'There is nothing at that address.',
		});
	}

	/**
	 * Answers anything thrown out of a route, and never lets it reach the runtime.
	 *
	 * @param caughtError What was thrown.
	 * @param request The request the browser made.
	 * @param response The answer being written.
	 * @param next The next handler, used when the answer has already started.
	 * @returns Nothing.
	 */
	private static _answerCaughtError(
		caughtError: unknown,
		request: Express.Request,
		response: Express.Response,
		next: Express.NextFunction,
	): void {
		const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
		process.stderr.write(`paullette-web: the request could not be answered: ${reason}\n`);

		if (response.headersSent === true) {
			next(caughtError);
			return;
		}

		response.status(500).json({
			error: 'The request could not be answered.',
		});
	}
}
