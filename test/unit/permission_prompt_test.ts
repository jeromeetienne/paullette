import Assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { PermissionPrompt } from '../../src/terminal/permission_prompt.ts';
import { StandardErrorCapture } from './libs/standard_error_capture.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	permission_prompt_test — checks PermissionPrompt refuses when there is no terminal to ask at
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One request to write a file, which is what a tool hands the prompt.
 */
const WRITE_REQUEST = {
	toolName: 'write_file',
	summary: 'write 16 characters to notes.md',
	detail: 'The new content.',
};

describe('PermissionPrompt.ask', () => {
	/** What `process.stdin.isTTY` held before the test, so that it can be put back. */
	let savedIsTerminal: boolean | undefined;

	beforeEach(() => {
		savedIsTerminal = process.stdin.isTTY;
	});

	afterEach(() => {
		Object.defineProperty(process.stdin, 'isTTY', {
			value: savedIsTerminal,
			configurable: true,
			writable: true,
		});
	});

	/**
	 * Says whether the code under test should believe it is running at a terminal.
	 *
	 * The tests must not depend on how the person running them started them, and a test that believed a real
	 * terminal was there would stop and wait for somebody to type an answer.
	 *
	 * @param isTerminal True to make the code believe there is a terminal.
	 * @returns Nothing.
	 */
	const setIsTerminal = (isTerminal: boolean): void => {
		Object.defineProperty(process.stdin, 'isTTY', {
			value: isTerminal === true ? true : undefined,
			configurable: true,
			writable: true,
		});
	};

	test('allows everything without asking when asking is turned off, which is what --yes does', async () => {
		setIsTerminal(false);
		const permissionPrompt = new PermissionPrompt(false);

		Assert.equal(await permissionPrompt.ask(WRITE_REQUEST), 'allowed');
	});

	test('allows everything without asking when asking is turned off, even at a terminal', async () => {
		setIsTerminal(true);
		const permissionPrompt = new PermissionPrompt(false);

		Assert.equal(await permissionPrompt.ask(WRITE_REQUEST), 'allowed');
	});

	test('refuses when there is no terminal to ask at', async () => {
		setIsTerminal(false);
		const permissionPrompt = new PermissionPrompt(true);

		const captured = await StandardErrorCapture.run(async () => {
			return await permissionPrompt.ask(WRITE_REQUEST);
		});

		Assert.equal(captured.result, 'refused');
	});

	test('says why it refused, and names the option that would have allowed it', async () => {
		setIsTerminal(false);
		const permissionPrompt = new PermissionPrompt(true);

		const captured = await StandardErrorCapture.run(async () => {
			return await permissionPrompt.ask(WRITE_REQUEST);
		});

		Assert.ok(captured.standardErrorText.includes('there is no terminal to ask at'));
		Assert.ok(captured.standardErrorText.includes('write_file'));
		Assert.ok(captured.standardErrorText.includes('--yes'));
	});

	test('refuses every request when there is no terminal, however many times it is asked', async () => {
		setIsTerminal(false);
		const permissionPrompt = new PermissionPrompt(true);

		const captured = await StandardErrorCapture.run(async () => {
			return [await permissionPrompt.ask(WRITE_REQUEST), await permissionPrompt.ask(WRITE_REQUEST)];
		});

		Assert.deepEqual(captured.result, ['refused', 'refused']);
	});
});
