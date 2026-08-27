import type Http from 'node:http';

import { type PermissionDecision } from 'paullette-core/tools/tool_types';
import { type WebConversation } from './web_conversation.ts';
import { type WebEventStream } from './web_event_stream.ts';
import { WebStaticFiles } from './web_static_files.ts';
import { type MessageRequestBody, type PermissionRequestBody } from './web_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebRouter — matches one method and one path to one answer
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The largest body the server reads from a browser, in characters. A message a person types is short, and a
 * body without a limit is a way to make the server hold as much memory as the sender likes.
 */
const MAXIMUM_BODY_CHARACTER_COUNT = 200000;

/**
 * What the router decided to answer, when the answer is not a stream.
 */
export type RoutedAnswer = {
	/** The status of the answer. */
	statusCode: number;
	/** What the answer is. */
	contentType: string;
	/** The bytes of the answer. */
	content: string | Buffer;
};

/**
 * Matches one method and one path to one answer.
 *
 * The stream at `/api/events` is the one path this class does not answer on its own, because it takes over the
 * request and holds it open. Everything else is a body written once.
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
	 * Answers one request.
	 *
	 * @param incomingMessage The request the browser made.
	 * @param serverResponse The answer being built, needed only by the stream, which takes it over.
	 * @returns The answer to write, or null when the request has been taken over by the stream.
	 */
	async route(
		incomingMessage: Http.IncomingMessage,
		serverResponse: Http.ServerResponse,
	): Promise<RoutedAnswer | null> {
		const method = incomingMessage.method ?? 'GET';
		const pathName = new URL(incomingMessage.url ?? '/', 'http://127.0.0.1').pathname;

		if (method === 'GET' && pathName === '/api/events') {
			this._eventStream.open(serverResponse);
			return null;
		}

		if (method === 'GET' && pathName === '/api/state') {
			return WebRouter._json(200, this._conversation.readState());
		}

		if (method === 'GET' && pathName === '/api/sessions') {
			return WebRouter._json(200, {
				sessions: this._conversation.listSessions(),
			});
		}

		if (method === 'GET' && pathName.startsWith('/api/sessions/') === true) {
			const identifier = decodeURIComponent(pathName.slice('/api/sessions/'.length));
			const messages = this._conversation.readSessionMessages(identifier);

			if (messages === null) {
				return WebRouter._json(404, {
					error: 'There is no such conversation.',
				});
			}

			return WebRouter._json(200, {
				identifier: identifier,
				messages: messages,
			});
		}

		if (method === 'POST' && pathName === '/api/message') {
			return await this._routeMessage(incomingMessage);
		}

		if (method === 'POST' && pathName === '/api/permission') {
			return await this._routePermission(incomingMessage);
		}

		if (method === 'GET') {
			const staticFile = WebStaticFiles.read(pathName);
			if (staticFile !== null) {
				return {
					statusCode: 200,
					contentType: staticFile.contentType,
					content: staticFile.content,
				};
			}
		}

		return WebRouter._json(404, {
			error: 'There is nothing at that address.',
		});
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Routes That Read A Body
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Starts one turn with the message the browser sent.
	 *
	 * @param incomingMessage The request the browser made.
	 * @returns The answer to write.
	 */
	private async _routeMessage(incomingMessage: Http.IncomingMessage): Promise<RoutedAnswer> {
		const body = await WebRouter._readJsonBody<MessageRequestBody>(incomingMessage);

		if (body === null || typeof body.message !== 'string') {
			return WebRouter._json(400, {
				error: 'The body must be an object holding a message, as text.',
			});
		}

		const outcome = this._conversation.sendMessage(body.message);

		if (outcome.isStarted === false) {
			return WebRouter._json(409, {
				error: outcome.refusedReason,
			});
		}

		return WebRouter._json(202, {
			started: true,
		});
	}

	/**
	 * Answers one waiting permission question.
	 *
	 * @param incomingMessage The request the browser made.
	 * @returns The answer to write.
	 */
	private async _routePermission(incomingMessage: Http.IncomingMessage): Promise<RoutedAnswer> {
		const body = await WebRouter._readJsonBody<PermissionRequestBody & { isAlways?: boolean }>(
			incomingMessage,
		);

		if (body === null || typeof body.identifier !== 'string') {
			return WebRouter._json(400, {
				error: 'The body must be an object holding an identifier and a decision.',
			});
		}

		const decision: PermissionDecision = body.decision === 'allowed' ? 'allowed' : 'refused';
		const wasAnswered = this._conversation.answerPermission(
			body.identifier,
			decision,
			body.isAlways === true,
		);

		if (wasAnswered === false) {
			return WebRouter._json(404, {
				error: 'There is no question waiting under that identifier.',
			});
		}

		return WebRouter._json(200, {
			answered: true,
		});
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds an answer carrying JSON.
	 *
	 * @param statusCode The status of the answer.
	 * @param value What to write.
	 * @returns The answer to write.
	 */
	private static _json(statusCode: number, value: unknown): RoutedAnswer {
		return {
			statusCode: statusCode,
			contentType: 'application/json; charset=utf-8',
			content: JSON.stringify(value),
		};
	}

	/**
	 * Reads the body of a request and parses it as JSON.
	 *
	 * A body that is too long, or that is not JSON, gives null rather than throwing, so that a caller answers
	 * with a sentence the sender can read instead of the server falling over.
	 *
	 * @param incomingMessage The request the browser made.
	 * @returns What the body held, or null when it could not be read.
	 */
	private static async _readJsonBody<TBody>(incomingMessage: Http.IncomingMessage): Promise<TBody | null> {
		const bodyText = await new Promise<string | null>((resolve) => {
			let collected = '';

			incomingMessage.on('data', (chunk: Buffer | string) => {
				collected += String(chunk);

				if (collected.length > MAXIMUM_BODY_CHARACTER_COUNT) {
					resolve(null);
					incomingMessage.destroy();
				}
			});
			incomingMessage.on('end', () => resolve(collected));
			incomingMessage.on('error', () => resolve(null));
		});

		if (bodyText === null) {
			return null;
		}

		try {
			const parsed = JSON.parse(bodyText) as unknown;
			return typeof parsed === 'object' && parsed !== null ? (parsed as TBody) : null;
		} catch {
			return null;
		}
	}
}
