import Assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { type CommandDefinition } from '../../src/config_folder/config_folder_types.ts';
import { CommandExpander } from '../../src/terminal/command_expander.ts';
import { ToolHarness } from './libs/tool_harness.ts';
import { TemporaryFolder } from './libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	command_expander_test — checks CommandExpander puts in the arguments, the shell output, and the files
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One slash command, holding only the field the expansion reads.
 *
 * @param promptTemplate The body of the slash command file.
 * @returns The slash command definition.
 */
const makeCommand = (promptTemplate: string): CommandDefinition => {
	return {
		name: 'review',
		description: 'The review command.',
		argumentHint: undefined,
		promptTemplate: promptTemplate,
		filePath: '/projects/code-agent/.code-agent/commands/review.md',
	};
};

describe('CommandExpander.expand', () => {
	/** The working folder each test uses. */
	let workingDirectoryPath = '';

	beforeEach(() => {
		workingDirectoryPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(workingDirectoryPath);
	});

	test('puts everything the user typed where $ARGUMENTS is written', async () => {
		const { toolContext } = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		const expandedText = await CommandExpander.expand(makeCommand('Review $ARGUMENTS now.'), '  src/cli.ts  ', toolContext);

		Assert.equal(expandedText, 'Review src/cli.ts now.');
	});

	test('puts each word the user typed where $1 to $9 are written', async () => {
		const { toolContext } = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		const expandedText = await CommandExpander.expand(makeCommand('Compare $1 with $2.'), 'first second', toolContext);

		Assert.equal(expandedText, 'Compare first with second.');
	});

	test('puts nothing where a numbered argument the user did not type is written', async () => {
		const { toolContext } = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		const expandedText = await CommandExpander.expand(makeCommand('Compare $1 with $2.'), 'first', toolContext);

		Assert.equal(expandedText, 'Compare first with .');
	});

	test('puts the same argument in every place it is written', async () => {
		const { toolContext } = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		const expandedText = await CommandExpander.expand(makeCommand('$1 and $1 again.'), 'once', toolContext);

		Assert.equal(expandedText, 'once and once again.');
	});

	test('puts the content of a file where an at sign and a path are written', async () => {
		TemporaryFolder.writeFile(workingDirectoryPath, 'notes.md', 'the content of the file');
		const { toolContext } = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		const expandedText = await CommandExpander.expand(makeCommand('Read @notes.md and answer.'), '', toolContext);

		Assert.equal(expandedText, 'Read the content of the file and answer.');
	});

	test('leaves a file reference exactly as it was when the file cannot be read', async () => {
		const { toolContext } = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		const expandedText = await CommandExpander.expand(makeCommand('Write to @missing.md.'), '', toolContext);

		Assert.equal(expandedText, 'Write to @missing.md.');
	});

	test('leaves an at sign that is not a file reference exactly as it was', async () => {
		const { toolContext } = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		const expandedText = await CommandExpander.expand(makeCommand('Ask @someone about it.'), '', toolContext);

		Assert.equal(expandedText, 'Ask @someone about it.');
	});

	test('leaves a file reference above the working folder exactly as it was', async () => {
		const { toolContext } = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		const expandedText = await CommandExpander.expand(makeCommand('Read @../../etc/passwd.'), '', toolContext);

		Assert.equal(expandedText, 'Read @../../etc/passwd.');
	});

	test('runs a shell command and puts its output in', async () => {
		const { toolContext } = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		const expandedText = await CommandExpander.expand(makeCommand('The branch is !`echo main`.'), '', toolContext);

		Assert.ok(expandedText.includes('standard output:\nmain'));
	});

	test('asks the user before it runs a shell command hidden in a slash command file', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'refused');

		const expandedText = await CommandExpander.expand(
			makeCommand('The branch is !`echo main`.'),
			'',
			harnessedContext.toolContext,
		);

		Assert.equal(harnessedContext.permissionAsker.requests.length, 1);
		Assert.equal(harnessedContext.permissionAsker.requests[0]?.detail, 'echo main');
		Assert.ok(expandedText.includes('refused'));
		Assert.equal(expandedText.includes('main.'), false);
	});

	test('runs every shell command written in the file', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		await CommandExpander.expand(
			makeCommand('!`echo first` and !`echo second`'),
			'',
			harnessedContext.toolContext,
		);

		Assert.deepEqual(
			harnessedContext.permissionAsker.requests.map((request) => request.detail),
			['echo first', 'echo second'],
		);
	});

	test('puts the arguments in before it runs the shell commands', async () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		await CommandExpander.expand(makeCommand('!`echo $1`'), 'from-the-user', harnessedContext.toolContext);

		Assert.equal(harnessedContext.permissionAsker.requests[0]?.detail, 'echo from-the-user');
	});

	test('leaves a template with nothing to put in exactly as it was', async () => {
		const { toolContext } = ToolHarness.makeContext(workingDirectoryPath, 'allowed');

		const expandedText = await CommandExpander.expand(makeCommand('Review the code.'), 'ignored', toolContext);

		Assert.equal(expandedText, 'Review the code.');
	});
});
