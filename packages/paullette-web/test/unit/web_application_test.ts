import Assert from 'node:assert/strict';
import Http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { WebApplication } from '../../src/server/web_application.ts';
import { type WebConversation } from '../../src/server/web_conversation.ts';
import { WebEventStream } from '../../src/server/web_event_stream.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	web_application_test — checks what the application mounts beside the routes under /api
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('What the application serves beside /api', () => {
	/** The server the requests of the tests are made against, listening on a port the operating system chose. */
	let server: Http.Server;
	/** The address the server is listening at, for example `http://127.0.0.1:51244`. */
	let address: string;
	/** The streams the application is built with. Nothing here opens one. */
	let webEventStream: WebEventStream;

	before(async () => {
		webEventStream = new WebEventStream();

		/*
			Not one test here reaches the conversation: the files sent to a browser, the address nothing is
			served at, and the reader of a body all answer without it. Standing an agent and a session store up
			to hold a conversation none of them touches would say the opposite.
		*/
		const conversation = {} as unknown as WebConversation;

		server = Http.createServer(
			WebApplication.build({
				conversation: conversation,
				eventStream: webEventStream,
			}),
		);

		await new Promise<void>((resolve) => {
			server.listen(0, '127.0.0.1', () => resolve());
		});

		const listening = server.address();
		const port = typeof listening === 'object' && listening !== null ? listening.port : 0;
		address = `http://127.0.0.1:${port}`;
	});

	after(async () => {
		server.closeAllConnections();

		await new Promise<void>((resolve) => {
			server.close(() => resolve());
		});
	});

	test('serves the page at the root of the address', async () => {
		const answer = await fetch(`${address}/`);

		Assert.equal(answer.status, 200);
		Assert.match(answer.headers.get('content-type') ?? '', /text\/html/);
		Assert.match(await answer.text(), /<title>paullette<\/title>/);
	});

	test('serves the stylesheet the page asks for', async () => {
		const answer = await fetch(`${address}/css/chat_page.css`);

		Assert.equal(answer.status, 200);
		Assert.match(answer.headers.get('content-type') ?? '', /text\/css/);
		Assert.match(await answer.text(), /\.streaming/);
	});

	test('serves the stylesheet of Bootstrap it was asked to lay the page out with', async () => {
		const answer = await fetch(`${address}/vendor/bootstrap/bootstrap.min.css`);

		Assert.equal(answer.status, 200);
		Assert.match(answer.headers.get('content-type') ?? '', /text\/css/);
		Assert.match(await answer.text(), /Bootstrap/);
	});

	test('serves the script of the page as JavaScript, with the types taken out', async () => {
		const answer = await fetch(`${address}/js/chat_page.js`);

		Assert.equal(answer.status, 200);
		Assert.match(answer.headers.get('content-type') ?? '', /text\/javascript/);

		const javaScript = await answer.text();
		Assert.match(javaScript, /class ChatPage/);
		Assert.match(javaScript, /ChatPage\.start\(\);/);
		Assert.equal(javaScript.includes('import type'), false, 'the type import must be gone');
		Assert.equal(javaScript.includes(': HTMLElement'), false, 'the type annotations must be gone');
	});

	test('serves the TypeScript the script was made from, as text a browser shows', async () => {
		const answer = await fetch(`${address}/src/chat_page.ts`);

		Assert.equal(answer.status, 200);
		Assert.match(answer.headers.get('content-type') ?? '', /text\/plain/);
		Assert.match(await answer.text(), /import type/);
	});

	test('answers with a not found for a script that does not exist', async () => {
		const answer = await fetch(`${address}/js/there-is-no-such-script.js`);

		Assert.equal(answer.status, 404);
	});

	test('answers with a not found at an address nothing is served at', async () => {
		const answer = await fetch(`${address}/nothing-here`);

		Assert.equal(answer.status, 404);
	});

	test('answers with a not found for an address that tries to climb out of the folder it serves', async () => {
		const answer = await fetch(`${address}/../package.json`, {
			redirect: 'manual',
		});

		Assert.equal(answer.status === 200, false, 'nothing outside public/chat may ever be sent');
	});

	test('refuses a body that is not JSON with a sentence the sender can read', async () => {
		const answer = await fetch(`${address}/api/message`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: 'this is not JSON',
		});

		Assert.equal(answer.status, 400);
		Assert.match(((await answer.json()) as { error: string }).error, /must be JSON/);
	});

	test('refuses a body longer than the limit', async () => {
		const answer = await fetch(`${address}/api/message`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				message: 'x'.repeat(300 * 1024),
			}),
		});

		Assert.equal(answer.status, 413);
		Assert.match(((await answer.json()) as { error: string }).error, /200kb/);
	});
});
