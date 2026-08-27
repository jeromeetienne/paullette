import Http from 'node:http';

import { type WebConversation } from './web_conversation.ts';
import { type WebEventStream } from './web_event_stream.ts';
import { type WebPermissionAsker } from './web_permission_asker.ts';
import { WebRouter } from './web_router.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebServer — builds the node:http server, listens, and closes
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
 * It is the `node:http` module of Node.js and nothing else. No web server library is used, because the whole of
 * what this serves is a handful of files, one stream, and four short requests; that was proved live before this
 * was written, and the reasons are in the plan on issue 9.
 */
export class WebServer {
	/** Everything the server needs. */
	private readonly _request: WebServerRequest;
	/** The server itself. */
	private readonly _server: Http.Server;
	/** The router, built once. */
	private readonly _router: WebRouter;

	/**
	 * Builds the server. Nothing listens until `listen` is called.
	 *
	 * @param request Everything the server needs.
	 */
	constructor(request: WebServerRequest) {
		this._request = request;
		this._router = new WebRouter(request.conversation, request.eventStream);
		this._server = Http.createServer((incomingMessage, serverResponse) => {
			void this._answer(incomingMessage, serverResponse);
		});
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

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Answers one request, and never lets anything thrown out of a route reach the runtime.
	 *
	 * @param incomingMessage The request the browser made.
	 * @param serverResponse The answer being written.
	 * @returns Nothing.
	 */
	private async _answer(
		incomingMessage: Http.IncomingMessage,
		serverResponse: Http.ServerResponse,
	): Promise<void> {
		try {
			const answer = await this._router.route(incomingMessage, serverResponse);

			if (answer === null) {
				return;
			}

			serverResponse.writeHead(answer.statusCode, {
				'content-type': answer.contentType,
				'cache-control': 'no-store',
			});
			serverResponse.end(answer.content);
		} catch (caughtError) {
			const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
			process.stderr.write(`paullette-web: the request could not be answered: ${reason}\n`);

			if (serverResponse.headersSent === false) {
				serverResponse.writeHead(500, {
					'content-type': 'application/json; charset=utf-8',
				});
				serverResponse.end(JSON.stringify({ error: 'The request could not be answered.' }));
				return;
			}

			serverResponse.end();
		}
	}
}
