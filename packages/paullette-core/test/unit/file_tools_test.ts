import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { FileTools } from '../../src/tools/file_tools.ts';
import { ToolHarness, type HarnessedToolContext } from '../libs/tool_harness.ts';
import { TemporaryFolder } from '../libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	file_tools_test — checks the file tools stay inside the working folder and ask before they change anything
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('FileTools', () => {
	/** The working folder each test uses. */
	let workingDirectoryPath = '';

	beforeEach(() => {
		workingDirectoryPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(workingDirectoryPath);
	});

	/**
	 * Builds the file tools against the working folder of the test.
	 *
	 * @param decision The answer the permission asker gives to every request.
	 * @returns The tools and the harnessed context they were built with.
	 */
	const makeTools = (decision: 'allowed' | 'refused') => {
		const harnessedContext: HarnessedToolContext = ToolHarness.makeContext(workingDirectoryPath, decision);
		return {
			tools: FileTools.createAll(harnessedContext.toolContext),
			harnessedContext: harnessedContext,
		};
	};

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	read_file
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	test('read_file gives back the whole content of a file', async () => {
		TemporaryFolder.writeFile(workingDirectoryPath, 'notes.md', 'The whole content.\n');
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'read_file', {
			filePath: 'notes.md',
		});

		Assert.equal(result, 'The whole content.\n');
	});

	test('read_file logs the short path rather than the absolute one', async () => {
		TemporaryFolder.writeFile(workingDirectoryPath, 'src/cli.ts', 'the code\n');
		const { tools, harnessedContext } = makeTools('allowed');

		await ToolHarness.invoke(tools, 'read_file', {
			filePath: 'src/cli.ts',
		});

		Assert.deepEqual(harnessedContext.toolCallLog, [
			{
				toolName: 'read_file',
				summary: Path.join('src', 'cli.ts'),
			},
		]);
	});

	test('read_file says what went wrong rather than throwing when the file is not there', async () => {
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'read_file', {
			filePath: 'missing.md',
		});

		Assert.ok(result.startsWith('That did not work:'));
	});

	test('read_file refuses a path above the working folder', async () => {
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'read_file', {
			filePath: '../../etc/passwd',
		});

		Assert.ok(result.includes('outside the working folder'));
	});

	test('read_file never asks for permission, because it changes nothing', async () => {
		TemporaryFolder.writeFile(workingDirectoryPath, 'notes.md', 'A note.\n');
		const { tools, harnessedContext } = makeTools('refused');

		const result = await ToolHarness.invoke(tools, 'read_file', {
			filePath: 'notes.md',
		});

		Assert.equal(result, 'A note.\n');
		Assert.deepEqual(harnessedContext.permissionAsker.requests, []);
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	write_file
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	test('write_file asks first, and writes the file once it is allowed', async () => {
		const { tools, harnessedContext } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'write_file', {
			filePath: 'notes.md',
			content: 'The new content.',
		});

		Assert.equal(Fs.readFileSync(Path.join(workingDirectoryPath, 'notes.md'), 'utf8'), 'The new content.');
		Assert.ok(result.includes('Wrote 16 characters to notes.md.'));
		Assert.equal(harnessedContext.permissionAsker.requests.length, 1);
		Assert.equal(harnessedContext.permissionAsker.requests[0]?.toolName, 'write_file');
		Assert.equal(harnessedContext.permissionAsker.requests[0]?.detail, 'The new content.');
	});

	test('write_file writes nothing when the user refuses', async () => {
		const { tools } = makeTools('refused');

		const result = await ToolHarness.invoke(tools, 'write_file', {
			filePath: 'notes.md',
			content: 'The new content.',
		});

		Assert.equal(Fs.existsSync(Path.join(workingDirectoryPath, 'notes.md')), false);
		Assert.ok(result.includes('refused'));
	});

	test('write_file makes the folders above the file', async () => {
		const { tools } = makeTools('allowed');

		await ToolHarness.invoke(tools, 'write_file', {
			filePath: 'docs/notes/today.md',
			content: 'A note.',
		});

		Assert.equal(Fs.existsSync(Path.join(workingDirectoryPath, 'docs', 'notes', 'today.md')), true);
	});

	test('write_file asks nothing and writes nothing for a path above the working folder', async () => {
		const { tools, harnessedContext } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'write_file', {
			filePath: '../escaped.md',
			content: 'Should never be written.',
		});

		Assert.ok(result.includes('outside the working folder'));
		Assert.deepEqual(harnessedContext.permissionAsker.requests, []);
		Assert.equal(Fs.existsSync(Path.join(Path.dirname(workingDirectoryPath), 'escaped.md')), false);
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	edit_file
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	test('edit_file replaces the one piece of text it was given', async () => {
		TemporaryFolder.writeFile(workingDirectoryPath, 'notes.md', 'one two three\n');
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'edit_file', {
			filePath: 'notes.md',
			oldText: 'two',
			newText: 'TWO',
		});

		Assert.equal(Fs.readFileSync(Path.join(workingDirectoryPath, 'notes.md'), 'utf8'), 'one TWO three\n');
		Assert.ok(result.includes('Changed notes.md.'));
	});

	test('edit_file changes nothing when the text is not in the file', async () => {
		TemporaryFolder.writeFile(workingDirectoryPath, 'notes.md', 'one two three\n');
		const { tools, harnessedContext } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'edit_file', {
			filePath: 'notes.md',
			oldText: 'four',
			newText: 'FOUR',
		});

		Assert.ok(result.includes('does not appear'));
		Assert.deepEqual(harnessedContext.permissionAsker.requests, []);
		Assert.equal(Fs.readFileSync(Path.join(workingDirectoryPath, 'notes.md'), 'utf8'), 'one two three\n');
	});

	test('edit_file changes nothing when the text appears more than once', async () => {
		TemporaryFolder.writeFile(workingDirectoryPath, 'notes.md', 'two two\n');
		const { tools, harnessedContext } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'edit_file', {
			filePath: 'notes.md',
			oldText: 'two',
			newText: 'TWO',
		});

		Assert.ok(result.includes('appears 2 times'));
		Assert.deepEqual(harnessedContext.permissionAsker.requests, []);
		Assert.equal(Fs.readFileSync(Path.join(workingDirectoryPath, 'notes.md'), 'utf8'), 'two two\n');
	});

	test('edit_file changes nothing when the user refuses', async () => {
		TemporaryFolder.writeFile(workingDirectoryPath, 'notes.md', 'one two three\n');
		const { tools } = makeTools('refused');

		const result = await ToolHarness.invoke(tools, 'edit_file', {
			filePath: 'notes.md',
			oldText: 'two',
			newText: 'TWO',
		});

		Assert.ok(result.includes('refused'));
		Assert.equal(Fs.readFileSync(Path.join(workingDirectoryPath, 'notes.md'), 'utf8'), 'one two three\n');
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	list_directory
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	test('list_directory marks a folder with a trailing slash and sorts what it found', async () => {
		TemporaryFolder.writeFile(workingDirectoryPath, 'notes.md', 'A note.');
		TemporaryFolder.writeFile(workingDirectoryPath, 'src/cli.ts', 'the code');
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'list_directory', {
			directoryPath: '.',
		});

		Assert.deepEqual(result.split('\n'), ['notes.md', 'src/']);
	});

	test('list_directory says a folder is empty rather than giving nothing back', async () => {
		Fs.mkdirSync(Path.join(workingDirectoryPath, 'empty'));
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'list_directory', {
			directoryPath: 'empty',
		});

		Assert.equal(result, 'empty is empty.');
	});

	test('list_directory refuses a folder above the working folder', async () => {
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'list_directory', {
			directoryPath: '..',
		});

		Assert.ok(result.includes('outside the working folder'));
	});
});
