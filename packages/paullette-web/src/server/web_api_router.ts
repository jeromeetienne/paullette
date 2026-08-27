import Express from 'express';

import { type WebConversation } from './web_conversation.ts';
import { type WebEventStream } from './web_event_stream.ts';
import {
	type MessageRequestBody,
	type PermissionRequestBody,
	type WebErrorBody,
	type WebSessionListBody,
	type WebSessionMessagesBody,
	type WebState,
} from './web_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebApiRouter — the router mounted at /api
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Everything the browser asks the server, as an Express router mounted at `/api`.
 *
 * Every path here is written without that prefix, the way a router is written in any Express application: the
 * route of the stream is `/events`, and it answers at `/api/events`.
 *
 * The stream is the one route that does not answer and end. It takes the answer over and holds it open until
 * the browser goes away. Everything else is a body written once.
 */
export class WebApiRouter {
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
	 * Builds the Express router holding every route under `/api`.
	 *
	 * @returns The router to mount.
	 */
	build(): Express.Router {
		const router = Express.Router();

		router.use((request, response, next) => {
			response.set('cache-control', 'no-store');
			next();
		});

		router.get('/events', (request, response) => {
			this._eventStream.open(response);
		});

		router.get('/state', (request, response) => {
			const state: WebState = this._conversation.readState();
			response.status(200).json(state);
		});

		router.get('/sessions', (request, response) => {
			const body: WebSessionListBody = {
				sessions: this._conversation.listSessions(),
			};
			response.status(200).json(body);
		});

		router.get('/sessions/:identifier', (request, response) => {
			const identifier = request.params.identifier;
			const messages = this._conversation.readSessionMessages(identifier);

			if (messages === null) {
				const error: WebErrorBody = {
					error: 'There is no such conversation.',
				};
				response.status(404).json(error);
				return;
			}

			const body: WebSessionMessagesBody = {
				identifier: identifier,
				messages: messages,
			};
			response.status(200).json(body);
		});

		router.post('/message', (request, response) => {
			const body = request.body as MessageRequestBody | undefined;

			if (body === undefined || typeof body.message !== 'string') {
				const error: WebErrorBody = {
					error: 'The body must be an object holding a message, as text.',
				};
				response.status(400).json(error);
				return;
			}

			const outcome = this._conversation.sendMessage(body.message);

			if (outcome.isStarted === false) {
				const error: WebErrorBody = {
					error: outcome.refusedReason,
				};
				response.status(409).json(error);
				return;
			}

			response.status(202).json({
				started: true,
			});
		});

		router.post('/permission', (request, response) => {
			const body = request.body as PermissionRequestBody | undefined;

			if (body === undefined || typeof body.identifier !== 'string') {
				const error: WebErrorBody = {
					error: 'The body must be an object holding an identifier and a decision.',
				};
				response.status(400).json(error);
				return;
			}

			const decision = body.decision === 'allowed' ? 'allowed' : 'refused';
			const wasAnswered = this._conversation.answerPermission(
				body.identifier,
				decision,
				body.isAlways === true,
			);

			if (wasAnswered === false) {
				const error: WebErrorBody = {
					error: 'There is no question waiting under that identifier.',
				};
				response.status(404).json(error);
				return;
			}

			response.status(200).json({
				answered: true,
			});
		});

		return router;
	}
}
