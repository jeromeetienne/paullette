import Assert from 'node:assert/strict';
import type Http from 'node:http';
import Path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { AgentBuilder } from 'paullette-core/agent/agent_builder';
import { ConversationSession } from 'paullette-core/agent/conversation_session';
import { SessionStore } from 'paullette-core/history/session_store';
import { TemporaryFolder } from 'paullette-core/test_helpers/temporary_folder';
import { WebConversation } from '../../src/server/web_conversation.ts';
import { WebEventStream } from '../../src/server/web_event_stream.ts';
import { WebPermissionAsker } from '../../src/server/web_permission_asker.ts';
import { WebRouter } from '../../src/server/web_router.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	web_router_test — checks each method and path reaches the answer it should
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The model named in the conversation. No request ever reaches it: not one test here calls `/api/message` with
 * a message that would start a turn.
 */
const MODEL_NAME = 'a-model-that-is-never-called';

/**
 * Builds a request as `node:http` would hand it to the server.
 *
 * @param method The method of the request.
 * @param url The path of the request.
 * @param body What the browser sent, or undefined for a request with no body.
 * @returns The request.
 */
const makeRequest = (method: string, url: string, body?: string): Http.IncomingMessage => {
	const incomingMessage = Readable.from(body === undefined ? [] : [body]) as Http.IncomingMessage;
	incomingMessage.method = method;
	incomingMessage.url = url;
	return incomingMessage;
};

/**
 * Builds the smallest answer object the stream route needs, and remembers what was written to it.
 *
 * @returns The answer object, and what it was given.
 */
const makeResponse = (): { serverResponse: Http.ServerResponse; written: string[] } => {
	const written: string[] = [];
	const serverResponse = {
		writeHead: () => serverResponse,
		write: (chunk: string) => {
			written.push(chunk);
			return true;
		},
		end: () => serverResponse,
		on: () => serverResponse,
	} as unknown as Http.ServerResponse;

	return {
		serverResponse: serverResponse,
		written: written,
	};
};

describe('WebRouter.route', () => {
	/** The folder the session store writes into, removed after each test. */
	let temporaryFolderPath: string;
	/** The router under test. */
	let webRouter: WebRouter;
	/** The conversation the router answers about. */
	let webConversation: WebConversation;
	/** The asker a permission answer has to reach. */
	let webPermissionAsker: WebPermissionAsker;
	/** The store the past conversations are read from. */
	let sessionStore: SessionStore;

	beforeEach(() => {
		temporaryFolderPath = TemporaryFolder.make();
		const sessionsFolderPath = Path.join(temporaryFolderPath, 'sessions');
		sessionStore = new SessionStore(sessionsFolderPath);
		webPermissionAsker = new WebPermissionAsker(true);

		webConversation = new WebConversation({
			agent: AgentBuilder.build({
				modelName: MODEL_NAME,
				systemPrompt: 'never used',
				tools: [],
			}),
			conversationSession: new ConversationSession(
				sessionStore,
				sessionsFolderPath,
				sessionStore.startSession(MODEL_NAME),
			),
			sessionStore: sessionStore,
			permissionAsker: webPermissionAsker,
			eventStream: new WebEventStream(),
			modelName: MODEL_NAME,
			workingDirectoryPath: temporaryFolderPath,
			maximumTurnCount: 1,
		});

		webRouter = new WebRouter(webConversation, new WebEventStream());
	});

	afterEach(() => {
		TemporaryFolder.remove(temporaryFolderPath);
	});

	/**
	 * Reads the JSON out of an answer of the router.
	 *
	 * @param content What the router said to write.
	 * @returns What the browser would parse.
	 */
	const readJson = (content: string | Buffer | undefined): Record<string, unknown> => {
		return JSON.parse(content === undefined ? '{}' : content.toString()) as Record<string, unknown>;
	};

	test('answers the state with the model, the folder, and an empty conversation', async () => {
		const answer = await webRouter.route(makeRequest('GET', '/api/state'), makeResponse().serverResponse);

		Assert.equal(answer?.statusCode, 200);
		const state = readJson(answer?.content);
		Assert.equal(state['modelName'], MODEL_NAME);
		Assert.equal(state['workingDirectoryPath'], temporaryFolderPath);
		Assert.deepEqual(state['messages'], []);
		Assert.equal(state['isTurnRunning'], false);
		Assert.equal(state['pendingPermission'], null);
	});

	test('answers the state with the question waiting for an answer', async () => {
		void webPermissionAsker.ask({
			toolName: 'write_file',
			summary: 'write 4 characters to notes.md',
			detail: 'oxen',
		});
		await new Promise((resolve) => setImmediate(resolve));

		const answer = await webRouter.route(makeRequest('GET', '/api/state'), makeResponse().serverResponse);
		const pending = readJson(answer?.content)['pendingPermission'] as Record<string, unknown>;

		Assert.equal(pending['toolName'], 'write_file');
		Assert.equal(pending['summary'], 'write 4 characters to notes.md');
		Assert.equal(pending['detail'], 'oxen');
	});

	test('answers an empty list of past conversations when nothing was saved', async () => {
		const answer = await webRouter.route(makeRequest('GET', '/api/sessions'), makeResponse().serverResponse);

		Assert.equal(answer?.statusCode, 200);
		Assert.deepEqual(readJson(answer?.content)['sessions'], []);
	});

	test('lists a past conversation once one has been saved', async () => {
		const storedSession = sessionStore.startSession('a-remembered-model');
		sessionStore.save(storedSession, []);

		const answer = await webRouter.route(makeRequest('GET', '/api/sessions'), makeResponse().serverResponse);
		const sessions = readJson(answer?.content)['sessions'] as Array<Record<string, unknown>>;

		Assert.equal(sessions.length, 1);
		Assert.equal(sessions[0]?.['identifier'], storedSession.identifier);
		Assert.equal(sessions[0]?.['modelName'], 'a-remembered-model');
		Assert.equal(sessions[0]?.['itemCount'], 0);
	});

	test('answers with a not found when a past conversation does not exist', async () => {
		const answer = await webRouter.route(
			makeRequest('GET', '/api/sessions/there-is-no-such-conversation'),
			makeResponse().serverResponse,
		);

		Assert.equal(answer?.statusCode, 404);
	});

	test('answers with a not found for an identifier that tries to climb out of the sessions folder', async () => {
		const answer = await webRouter.route(
			makeRequest('GET', '/api/sessions/..%2F..%2Fpackage'),
			makeResponse().serverResponse,
		);

		Assert.equal(answer?.statusCode, 404);
	});

	test('answers a permission question and releases the tool parked on it', async () => {
		const asking = webPermissionAsker.ask({
			toolName: 'write_file',
			summary: 'write 4 characters to notes.md',
			detail: 'oxen',
		});
		await new Promise((resolve) => setImmediate(resolve));
		const identifier = webPermissionAsker.waitingPermission?.identifier ?? '';

		const answer = await webRouter.route(
			makeRequest('POST', '/api/permission', JSON.stringify({ identifier: identifier, decision: 'allowed' })),
			makeResponse().serverResponse,
		);

		Assert.equal(answer?.statusCode, 200);
		Assert.equal(await asking, 'allowed');
	});

	test('answers with a not found when the permission answer names no waiting question', async () => {
		const answer = await webRouter.route(
			makeRequest(
				'POST',
				'/api/permission',
				JSON.stringify({ identifier: 'permission-404', decision: 'allowed' }),
			),
			makeResponse().serverResponse,
		);

		Assert.equal(answer?.statusCode, 404);
	});

	test('refuses a permission answer whose body is not an object holding an identifier', async () => {
		const answer = await webRouter.route(
			makeRequest('POST', '/api/permission', 'this is not JSON'),
			makeResponse().serverResponse,
		);

		Assert.equal(answer?.statusCode, 400);
	});

	test('refuses a message whose body holds no message', async () => {
		const answer = await webRouter.route(
			makeRequest('POST', '/api/message', JSON.stringify({ nothing: true })),
			makeResponse().serverResponse,
		);

		Assert.equal(answer?.statusCode, 400);
	});

	test('refuses an empty message before any turn is started', async () => {
		const answer = await webRouter.route(
			makeRequest('POST', '/api/message', JSON.stringify({ message: '   ' })),
			makeResponse().serverResponse,
		);

		Assert.equal(answer?.statusCode, 409);
		Assert.equal(readJson(answer?.content)['error'], 'The message is empty.');
	});

	test('serves the page at the root of the address', async () => {
		const answer = await webRouter.route(makeRequest('GET', '/'), makeResponse().serverResponse);

		Assert.equal(answer?.statusCode, 200);
		Assert.equal(answer?.contentType, 'text/html; charset=utf-8');
	});

	test('answers with a not found at an address nothing is served at', async () => {
		const answer = await webRouter.route(makeRequest('GET', '/nothing-here'), makeResponse().serverResponse);

		Assert.equal(answer?.statusCode, 404);
	});

	test('takes over the request at the stream and answers nothing itself', async () => {
		const { serverResponse, written } = makeResponse();

		const answer = await webRouter.route(makeRequest('GET', '/api/events'), serverResponse);

		Assert.equal(answer, null, 'the stream route holds the request open rather than answering it');
		Assert.equal(written.length > 0, true, 'the stream must be opened with something written on it');
	});
});
