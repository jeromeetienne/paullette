import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { ShellTools } from '../../src/tools/shell_tools.ts';
import { ToolHarness } from './libs/tool_harness.ts';
import { TemporaryFolder } from './libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	shell_tools_test — checks run_shell_command asks first and reports what the command printed
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('ShellTools', () => {
	/** The working folder each test uses. */
	let workingDirectoryPath = '';

	beforeEach(() => {
		workingDirectoryPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(workingDirectoryPath);
	});

	test('runs the command once it is allowed and gives back its exit status and its output', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'allowed');
		const tools = ShellTools.createAll(harnessedContext.toolContext);

		const result = await ToolHarness.invoke(tools, 'run_shell_command', {
			command: 'echo hello',
		});

		Assert.ok(result.includes('exit status: 0'));
		Assert.ok(result.includes('standard output:\nhello'));
	});

	test('shows the user the command itself before it runs', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'allowed');
		const tools = ShellTools.createAll(harnessedContext.toolContext);

		await ToolHarness.invoke(tools, 'run_shell_command', {
			command: 'echo hello',
		});

		Assert.equal(harnessedContext.permissionAsker.requests.length, 1);
		Assert.equal(harnessedContext.permissionAsker.requests[0]?.toolName, 'run_shell_command');
		Assert.equal(harnessedContext.permissionAsker.requests[0]?.detail, 'echo hello');
	});

	test('does not run the command when the user refuses', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'refused');
		const tools = ShellTools.createAll(harnessedContext.toolContext);

		const result = await ToolHarness.invoke(tools, 'run_shell_command', {
			command: `touch ${Path.join(workingDirectoryPath, 'made-by-the-shell.txt')}`,
		});

		Assert.ok(result.includes('refused'));
		Assert.equal(Fs.existsSync(Path.join(workingDirectoryPath, 'made-by-the-shell.txt')), false);
	});

	test('runs the command in the working folder', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'allowed');
		const tools = ShellTools.createAll(harnessedContext.toolContext);

		await ToolHarness.invoke(tools, 'run_shell_command', {
			command: 'touch made-by-the-shell.txt',
		});

		Assert.equal(Fs.existsSync(Path.join(workingDirectoryPath, 'made-by-the-shell.txt')), true);
	});

	test('reports a command that failed rather than throwing', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'allowed');
		const tools = ShellTools.createAll(harnessedContext.toolContext);

		const result = await ToolHarness.invoke(tools, 'run_shell_command', {
			command: 'exit 3',
		});

		Assert.ok(result.includes('exit status: 3'));
	});

	test('gives back what the command wrote to the standard error as well', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'allowed');
		const tools = ShellTools.createAll(harnessedContext.toolContext);

		const result = await ToolHarness.invoke(tools, 'run_shell_command', {
			command: 'echo trouble 1>&2',
		});

		Assert.ok(result.includes('standard error:\ntrouble'));
	});

	test('says the command printed nothing rather than giving back a bare exit status', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'allowed');
		const tools = ShellTools.createAll(harnessedContext.toolContext);

		const result = await ToolHarness.invoke(tools, 'run_shell_command', {
			command: 'true',
		});

		Assert.ok(result.includes('the command printed nothing'));
	});

	test('logs the command it was asked to run', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'allowed');
		const tools = ShellTools.createAll(harnessedContext.toolContext);

		await ToolHarness.invoke(tools, 'run_shell_command', {
			command: 'echo hello',
		});

		Assert.deepEqual(harnessedContext.toolCallLog, [
			{
				toolName: 'run_shell_command',
				summary: 'echo hello',
			},
		]);
	});
});
