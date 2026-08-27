import Assert from 'node:assert/strict';
import Express from 'express';
import Http from 'node:http';
import Path from 'node:path';
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

describe('The routes of the web interface', () => {
	/** The folder the session store writes into, removed after each test. */
	let temporaryFolderPath: string;
	/** The server the requests of the tests are made against, listening on a port the operating system chose. */
	let server: Http.Server;
	/** The address the server is listening at, for example `http://127.0.0.1:51244`. */
	let address: string;
	/** The conversation the router answers about. */
	let webConversation: WebConversation;
	/** The asker a permission answer has to reach. */
	let webPermissionAsker: WebPermissionAsker;
	/** The streams the route at `/api/events` opens, closed after each test. */
	let webEventStream: WebEventStream;
	/** The store the past conversations are read from. */
	let sessionStore: SessionStore;

	beforeEach(async () => {
		temporaryFolderPath = TemporaryFolder.make();
		const sessionsFolderPath = Path.join(temporaryFolderPath, 'sessions');
		sessionStore = new SessionStore(sessionsFolderPath);
		webPermissionAsker = new WebPermissionAsker(true);
		webEventStream = new WebEventStream();

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

		const application = Express();
		application.use(new WebRouter(webConversation, webEventStream).build());
		server = Http.createServer(application);

		await new Promise<void>((resolve) => {
			server.listen(0, '127.0.0.1', () => resolve());
		});

		const listening = server.address();
		const port = typeof listening === 'object' && listening !== null ? listening.port : 0;
		address = `http://127.0.0.1:${port}`;
	});

	afterEach(async () => {
		webEventStream.closeEveryStream();
		server.closeAllConnections();

		await new Promise<void>((resolve) => {
			server.close(() => resolve());
		});

		TemporaryFolder.remove(temporaryFolderPath);
	});

	/**
	 * Sends one request with a body of JSON.
	 *
	 * @param method The method of the request.
	 * @param path The path of the request.
	 * @param body What the browser sends, already written out as text.
	 * @returns What the server answered.
	 */
	const send = async (method: string, path: string, body: string): Promise<Response> => {
		return await fetch(`${address}${path}`, {
			method: method,
			headers: {
				'content-type': 'application/json',
			},
			body: body,
		});
	};

	test('answers the state with the model, the folder, and an empty conversation', async () => {
		const answer = await fetch(`${address}/api/state`);

		Assert.equal(answer.status, 200);
		const state = (await answer.json()) as Record<string, unknown>;
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

		const answer = await fetch(`${address}/api/state`);
		const state = (await answer.json()) as Record<string, unknown>;
		const pending = state['pendingPermission'] as Record<string, unknown>;

		Assert.equal(pending['toolName'], 'write_file');
		Assert.equal(pending['summary'], 'write 4 characters to notes.md');
		Assert.equal(pending['detail'], 'oxen');
	});

	test('answers an empty list of past conversations when nothing was saved', async () => {
		const answer = await fetch(`${address}/api/sessions`);

		Assert.equal(answer.status, 200);
		Assert.deepEqual(((await answer.json()) as Record<string, unknown>)['sessions'], []);
	});

	test('lists a past conversation once one has been saved', async () => {
		const storedSession = sessionStore.startSession('a-remembered-model');
		sessionStore.save(storedSession, []);

		const answer = await fetch(`${address}/api/sessions`);
		const body = (await answer.json()) as Record<string, unknown>;
		const sessions = body['sessions'] as Array<Record<string, unknown>>;

		Assert.equal(sessions.length, 1);
		Assert.equal(sessions[0]?.['identifier'], storedSession.identifier);
		Assert.equal(sessions[0]?.['modelName'], 'a-remembered-model');
		Assert.equal(sessions[0]?.['itemCount'], 0);
	});

	test('answers with a not found when a past conversation does not exist', async () => {
		const answer = await fetch(`${address}/api/sessions/there-is-no-such-conversation`);

		Assert.equal(answer.status, 404);
	});

	test('answers with a not found for an identifier that tries to climb out of the sessions folder', async () => {
		const answer = await fetch(`${address}/api/sessions/..%2F..%2Fpackage`);

		Assert.equal(answer.status, 404);
	});

	test('answers a permission question and releases the tool parked on it', async () => {
		const asking = webPermissionAsker.ask({
			toolName: 'write_file',
			summary: 'write 4 characters to notes.md',
			detail: 'oxen',
		});
		await new Promise((resolve) => setImmediate(resolve));
		const identifier = webPermissionAsker.waitingPermission?.identifier ?? '';

		const answer = await send(
			'POST',
			'/api/permission',
			JSON.stringify({ identifier: identifier, decision: 'allowed' }),
		);

		Assert.equal(answer.status, 200);
		Assert.equal(await asking, 'allowed');
	});

	test('answers with a not found when the permission answer names no waiting question', async () => {
		const answer = await send(
			'POST',
			'/api/permission',
			JSON.stringify({ identifier: 'permission-404', decision: 'allowed' }),
		);

		Assert.equal(answer.status, 404);
	});

	test('refuses a permission answer whose body is not an object holding an identifier', async () => {
		const answer = await send('POST', '/api/permission', 'this is not JSON');

		Assert.equal(answer.status, 400);
	});

	test('refuses a message whose body holds no message', async () => {
		const answer = await send('POST', '/api/message', JSON.stringify({ nothing: true }));

		Assert.equal(answer.status, 400);
	});

	test('refuses an empty message before any turn is started', async () => {
		const answer = await send('POST', '/api/message', JSON.stringify({ message: '   ' }));

		Assert.equal(answer.status, 409);
		Assert.equal(((await answer.json()) as Record<string, unknown>)['error'], 'The message is empty.');
	});

	test('serves the page at the root of the address', async () => {
		const answer = await fetch(`${address}/`);

		Assert.equal(answer.status, 200);
		Assert.equal(answer.headers.get('content-type'), 'text/html; charset=utf-8');
	});

	test('serves the stylesheet of Bootstrap it was asked to lay the page out with', async () => {
		const answer = await fetch(`${address}/bootstrap.css`);

		Assert.equal(answer.status, 200);
		Assert.equal(answer.headers.get('content-type'), 'text/css; charset=utf-8');
		Assert.match(await answer.text(), /Bootstrap/);
	});

	test('answers with a not found at an address nothing is served at', async () => {
		const answer = await fetch(`${address}/nothing-here`);

		Assert.equal(answer.status, 404);
	});

	test('takes over the request at the stream and holds it open', async () => {
		const answer = await fetch(`${address}/api/events`);

		Assert.equal(answer.status, 200);
		Assert.equal(answer.headers.get('content-type'), 'text/event-stream; charset=utf-8');
		Assert.equal(webEventStream.openStreamCount, 1, 'the stream must be held open, not answered and ended');

		const reader = answer.body?.getReader();
		const firstChunk = await reader?.read();
		Assert.equal(
			new TextDecoder().decode(firstChunk?.value).length > 0,
			true,
			'the stream must be opened with something written on it',
		);
		await reader?.cancel();
	});
});
