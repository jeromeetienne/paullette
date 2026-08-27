import Express from 'express';
import Http from 'node:http';

import { type WebConversation } from './web_conversation.ts';
import { type WebEventStream } from './web_event_stream.ts';
import { type WebPermissionAsker } from './web_permission_asker.ts';
import { WebRouter } from './web_router.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebServer — builds the Express application, listens, and closes
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Everything the server needs in order to listen.
 */
export type WebServerRequest = {
	/** The conversation every browser shares. */
	conversation: WebConversation;
	/** The open streams. */
	eventStream: WebEventStream;
	/** Asks the browser before a tool changes anything, refused for everything still waiting when closing. */
	permissionAsker: WebPermissionAsker;
	/** The address to listen on. */
	host: string;
	/** The port to listen on. Zero asks the operating system for a free one. */
	port: number;
};

/**
 * The web server of paullette.
 *
 * It is an Express application served by the `node:http` module of Node.js. Nothing is added to Express beyond
 * the router, no compression above all: the stream at `/api/events` has to reach the browser as each event is
 * written, and a compressor holds what it is given until it has enough of it to be worth compressing.
 */
export class WebServer {
	/** Everything the server needs. */
	private readonly _request: WebServerRequest;
	/** The server itself. */
	private readonly _server: Http.Server;

	/**
	 * Builds the server. Nothing listens until `listen` is called.
	 *
	 * @param request Everything the server needs.
	 */
	constructor(request: WebServerRequest) {
		this._request = request;

		const application = Express();
		application.disable('x-powered-by');
		application.use(new WebRouter(request.conversation, request.eventStream).build());

		this._server = Http.createServer(application);
	}

	/**
	 * Starts listening.
	 *
	 * @returns The address a person types into a browser.
	 */
	async listen(): Promise<string> {
		await new Promise<void>((resolve, reject) => {
			this._server.once('error', reject);
			this._server.listen(this._request.port, this._request.host, () => {
				this._server.removeListener('error', reject);
				resolve();
			});
		});

		const address = this._server.address();
		const listeningPort = typeof address === 'object' && address !== null ? address.port : this._request.port;
		const shownHost = this._request.host === '0.0.0.0' ? '127.0.0.1' : this._request.host;

		return `http://${shownHost}:${listeningPort}`;
	}

	/**
	 * Stops listening, closes every open stream, and refuses every question still waiting.
	 *
	 * A tool parked on a question nobody will ever answer would hold the turn, and the turn would hold the
	 * process, so the safe direction when closing is to refuse.
	 *
	 * @returns Nothing.
	 */
	async close(): Promise<void> {
		this._request.permissionAsker.refuseEveryWaitingPermission();
		this._request.eventStream.closeEveryStream();

		await new Promise<void>((resolve) => {
			this._server.close(() => resolve());
		});
	}
}
