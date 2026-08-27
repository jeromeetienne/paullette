import Express from 'express';

import { WebApiRouter } from './web_api_router.ts';
import { WebBrowserScript } from './web_browser_script.ts';
import { type WebConversation } from './web_conversation.ts';
import { type WebEventStream } from './web_event_stream.ts';
import { WebStaticFiles } from './web_static_files.ts';
import { type WebErrorBody } from './web_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebApplication — the Express application: the middleware, the routers, the answers of last resort
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The largest body the server reads from a browser. A message a person types is short, and a body without a
 * limit is a way to make the server hold as much memory as the sender likes.
 */
const MAXIMUM_BODY_SIZE = '200kb';

/**
 * What the application needs in order to answer.
 */
export type WebApplicationRequest = {
	/** The conversation every browser shares. */
	conversation: WebConversation;
	/** The open streams. */
	eventStream: WebEventStream;
};

/**
 * The Express application of the web interface.
 *
 * It is put together in the order any Express application is: the reader of a body, then the routers, then the
 * address nothing is served at, then the answer of last resort. Nothing else is mounted, no compression above
 * all: the stream at `/api/events` has to reach the browser as each event is written, and a compressor holds
 * what it is given until it has enough of it to be worth compressing.
 */
export class WebApplication {
	/**
	 * Builds the application. Nothing listens until `WebServer` gives it to `node:http`.
	 *
	 * @param request What the application needs in order to answer.
	 * @returns The application.
	 */
	static build(request: WebApplicationRequest): Express.Application {
		const application = Express();
		application.disable('x-powered-by');

		application.use(
			Express.json({
				limit: MAXIMUM_BODY_SIZE,
			}),
		);

		application.use('/api', new WebApiRouter(request.conversation, request.eventStream).build());
		application.use('/js', WebBrowserScript.router());
		application.use('/vendor/bootstrap', Express.static(WebStaticFiles.bootstrapStylesheetFolderPath()));
		application.use(
			Express.static(WebStaticFiles.chatFolderPath(), {
				setHeaders: WebStaticFiles.nameTypeScriptAsText,
			}),
		);

		application.use(WebApplication._answerNotFound);
		application.use(WebApplication._answerCaughtError);

		return application;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Answers That Are Not A Route
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Answers every address nothing is served at.
	 *
	 * @param request The request the browser made.
	 * @param response The answer being written.
	 * @returns Nothing.
	 */
	private static _answerNotFound(request: Express.Request, response: Express.Response): void {
		const error: WebErrorBody = {
			error: 'There is nothing at that address.',
		};
		response.status(404).json(error);
	}

	/**
	 * Answers anything thrown out of a route or out of the reader of a body, and never lets it reach the
	 * runtime.
	 *
	 * A body that is not JSON, or that is longer than the limit, is thrown by the reader of Express carrying the
	 * status it deserves. Everything else is a fault of the server, is written to the standard error, and is
	 * answered with a sentence that says nothing about what went wrong inside.
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
		if (response.headersSent === true) {
			next(caughtError);
			return;
		}

		const status = WebApplication._statusOf(caughtError);

		if (status === 400 || status === 413) {
			const error: WebErrorBody = {
				error: `The body must be JSON, and no longer than ${MAXIMUM_BODY_SIZE}.`,
			};
			response.status(status).json(error);
			return;
		}

		const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
		process.stderr.write(`paullette-web: the request could not be answered: ${reason}\n`);

		const error: WebErrorBody = {
			error: 'The request could not be answered.',
		};
		response.status(500).json(error);
	}

	/**
	 * The status an error asks to be answered with.
	 *
	 * The reader of a body of Express throws an error carrying one, in the way of the `http-errors` package
	 * every part of Express uses. Anything else is a fault of the server.
	 *
	 * @param caughtError What was thrown.
	 * @returns The status it asks for, or 500 when it asks for none.
	 */
	private static _statusOf(caughtError: unknown): number {
		const status = (caughtError as { status?: unknown; statusCode?: unknown } | null)?.status;
		if (typeof status === 'number') {
			return status;
		}

		const statusCode = (caughtError as { statusCode?: unknown } | null)?.statusCode;
		if (typeof statusCode === 'number') {
			return statusCode;
		}

		return 500;
	}
}
