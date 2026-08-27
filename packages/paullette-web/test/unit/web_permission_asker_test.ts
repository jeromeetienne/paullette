import Assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { WebPermissionAsker } from '../../src/server/web_permission_asker.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	web_permission_asker_test — checks a question parks until a second request answers it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One request to write a file, which is what a tool hands the asker.
 */
const WRITE_REQUEST = {
	toolName: 'write_file',
	summary: 'write 16 characters to notes.md',
	detail: 'The new content.',
};

/**
 * One request to run a shell command, so that a test can tell two tool names apart.
 */
const SHELL_REQUEST = {
	toolName: 'run_shell_command',
	summary: 'run ls',
	detail: 'ls',
};

describe('WebPermissionAsker.ask', () => {
	test('allows everything without asking when asking is turned off, which is what --yes does', async () => {
		const permissionAsker = new WebPermissionAsker(false);

		Assert.equal(await permissionAsker.ask(WRITE_REQUEST), 'allowed');
		Assert.equal(permissionAsker.waitingPermission, null);
	});

	test('parks the question and does not answer until an answer arrives', async () => {
		const permissionAsker = new WebPermissionAsker(true);

		let wasSettled = false;
		const asking = permissionAsker.ask(WRITE_REQUEST).then((decision) => {
			wasSettled = true;
			return decision;
		});

		await new Promise((resolve) => setImmediate(resolve));
		Assert.equal(wasSettled, false, 'the question must still be waiting');

		const waiting = permissionAsker.waitingPermission;
		Assert.notEqual(waiting, null);
		Assert.equal(waiting?.request.toolName, 'write_file');
		Assert.equal(waiting?.request.summary, 'write 16 characters to notes.md');

		Assert.equal(permissionAsker.answer(waiting?.identifier ?? '', 'allowed', false), true);
		Assert.equal(await asking, 'allowed');
		Assert.equal(permissionAsker.waitingPermission, null);
	});

	test('gives back what the browser answered, whichever answer it was', async () => {
		const permissionAsker = new WebPermissionAsker(true);

		const asking = permissionAsker.ask(WRITE_REQUEST);
		await new Promise((resolve) => setImmediate(resolve));

		const identifier = permissionAsker.waitingPermission?.identifier ?? '';
		permissionAsker.answer(identifier, 'refused', false);

		Assert.equal(await asking, 'refused');
	});

	test('tells its listener as soon as a question starts waiting', async () => {
		const permissionAsker = new WebPermissionAsker(true);
		const seenToolNames: string[] = [];

		permissionAsker.setWaitingListener((waiting) => {
			seenToolNames.push(waiting.request.toolName);
			permissionAsker.answer(waiting.identifier, 'allowed', false);
		});

		Assert.equal(await permissionAsker.ask(WRITE_REQUEST), 'allowed');
		Assert.deepEqual(seenToolNames, ['write_file']);
	});

	test('gives every question an identifier of its own', async () => {
		const permissionAsker = new WebPermissionAsker(true);
		const seenIdentifiers: string[] = [];

		permissionAsker.setWaitingListener((waiting) => {
			seenIdentifiers.push(waiting.identifier);
			permissionAsker.answer(waiting.identifier, 'allowed', false);
		});

		await permissionAsker.ask(WRITE_REQUEST);
		await permissionAsker.ask(SHELL_REQUEST);

		Assert.equal(seenIdentifiers.length, 2);
		Assert.notEqual(seenIdentifiers[0], seenIdentifiers[1]);
	});

	test('refuses an answer that names no waiting question', () => {
		const permissionAsker = new WebPermissionAsker(true);

		Assert.equal(permissionAsker.answer('permission-404', 'allowed', false), false);
	});

	test('remembers an always answer for the same tool and asks again for a different one', async () => {
		const permissionAsker = new WebPermissionAsker(true);
		const askedToolNames: string[] = [];

		permissionAsker.setWaitingListener((waiting) => {
			askedToolNames.push(waiting.request.toolName);
			permissionAsker.answer(waiting.identifier, 'allowed', true);
		});

		await permissionAsker.ask(WRITE_REQUEST);
		await permissionAsker.ask(WRITE_REQUEST);
		await permissionAsker.ask(SHELL_REQUEST);

		Assert.deepEqual(
			askedToolNames,
			['write_file', 'run_shell_command'],
			'the second write_file must not be asked about again',
		);
	});

	test('does not remember an always answer that refused', async () => {
		const permissionAsker = new WebPermissionAsker(true);
		let askedCount = 0;

		permissionAsker.setWaitingListener((waiting) => {
			askedCount += 1;
			permissionAsker.answer(waiting.identifier, 'refused', true);
		});

		await permissionAsker.ask(WRITE_REQUEST);
		await permissionAsker.ask(WRITE_REQUEST);

		Assert.equal(askedCount, 2);
	});

	test('refuses every waiting question when the server closes', async () => {
		const permissionAsker = new WebPermissionAsker(true);

		const asking = permissionAsker.ask(WRITE_REQUEST);
		await new Promise((resolve) => setImmediate(resolve));

		Assert.equal(permissionAsker.refuseEveryWaitingPermission(), 1);
		Assert.equal(await asking, 'refused');
		Assert.equal(permissionAsker.waitingPermission, null);
	});
});
