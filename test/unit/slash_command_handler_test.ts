import Assert from 'node:assert/strict';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { ConfigFolderReader } from '../../src/config_folder/config_folder_reader.ts';
import { SessionStore } from '../../src/history/session_store.ts';
import { MemoryStore } from '../../src/memory/memory_store.ts';
import { ConversationSession } from '../../src/terminal/conversation_session.ts';
import { SlashCommandHandler } from '../../src/terminal/slash_command_handler.ts';
import { StandardErrorCapture } from './libs/standard_error_capture.ts';
import { ToolHarness } from './libs/tool_harness.ts';
import { TemporaryFolder } from './libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	slash_command_handler_test — checks SlashCommandHandler tells the loop what to do with a typed line
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('SlashCommandHandler.parse', () => {
	test('gives nothing back for a line that is not a slash command', () => {
		Assert.equal(SlashCommandHandler.parse('what does this project do'), null);
		Assert.equal(SlashCommandHandler.parse('  ask about /review  '), null);
	});

	test('reads the name of a command typed with nothing after it', () => {
		Assert.deepEqual(SlashCommandHandler.parse('/help'), {
			name: 'help',
			argumentText: '',
		});
	});

	test('reads the name and the arguments of a command', () => {
		Assert.deepEqual(SlashCommandHandler.parse('/review src/cli.ts and src/agent'), {
			name: 'review',
			argumentText: 'src/cli.ts and src/agent',
		});
	});

	test('reads a command with spaces around it', () => {
		Assert.deepEqual(SlashCommandHandler.parse('   /review   src/cli.ts   '), {
			name: 'review',
			argumentText: 'src/cli.ts',
		});
	});

	test('reads the name of a command that lives in a subfolder', () => {
		Assert.deepEqual(SlashCommandHandler.parse('/git:commit the change'), {
			name: 'git:commit',
			argumentText: 'the change',
		});
	});
});

describe('SlashCommandHandler.handle', () => {
	/** The folder each test works inside, standing in for a project. */
	let projectFolderPath = '';
	/** The handler under test. */
	let slashCommandHandler: SlashCommandHandler;

	/**
	 * Reads the `.code-agent` folder as it stands now and builds a handler on top of it.
	 *
	 * A test that adds a file to the folder calls this again, because the handler is given everything that was
	 * read once and never reads the folder a second time.
	 *
	 * @returns Nothing.
	 */
	const buildHandler = (): void => {
		const content = ConfigFolderReader.read(projectFolderPath);
		const sessionsFolderPath = Path.join(content.paths.configFolderPath, 'sessions');
		const sessionStore = new SessionStore(sessionsFolderPath);
		const conversationSession = new ConversationSession(
			sessionStore,
			sessionsFolderPath,
			sessionStore.startSession('a-model'),
		);

		slashCommandHandler = new SlashCommandHandler(
			content,
			ToolHarness.makeContext(projectFolderPath, 'allowed').toolContext,
			new MemoryStore(Path.join(content.paths.configFolderPath, 'memory')),
			conversationSession,
			'a-model',
		);
	};

	beforeEach(() => {
		projectFolderPath = TemporaryFolder.make();
		TemporaryFolder.writeFile(projectFolderPath, '.code-agent/commands/review.md', 'Review $ARGUMENTS.\n');
		TemporaryFolder.writeFile(projectFolderPath, '.code-agent/agents/reviewer.md', 'Review the diff.\n');
		buildHandler();
	});

	afterEach(() => {
		TemporaryFolder.remove(projectFolderPath);
	});

	/**
	 * Hands one typed line to the handler with the standard error held back.
	 *
	 * @param line The line the user typed.
	 * @returns What the handler said the loop should do next, and what it printed.
	 */
	const handle = async (line: string) => {
		return await StandardErrorCapture.run(async () => {
			return await slashCommandHandler.handle(line);
		});
	};

	test('says a line without a slash is an ordinary message for the model', async () => {
		const captured = await handle('what does this project do');

		Assert.deepEqual(captured.result, {
			kind: 'notACommand',
		});
	});

	test('says the user asked to leave for both /exit and /quit', async () => {
		Assert.deepEqual((await handle('/exit')).result, {
			kind: 'quit',
		});
		Assert.deepEqual((await handle('/quit')).result, {
			kind: 'quit',
		});
	});

	test('answers /help itself and names the commands read from the folder', async () => {
		const captured = await handle('/help');

		Assert.deepEqual(captured.result, {
			kind: 'handled',
		});
		Assert.ok(captured.standardErrorText.includes('/review'));
		Assert.ok(captured.standardErrorText.includes('/exit'));
	});

	test('answers /agents itself and names the subagents that were read', async () => {
		const captured = await handle('/agents');

		Assert.deepEqual(captured.result, {
			kind: 'handled',
		});
		Assert.ok(captured.standardErrorText.includes('reviewer'));
	});

	test('answers /memory itself and says when nothing has been remembered', async () => {
		const captured = await handle('/memory');

		Assert.deepEqual(captured.result, {
			kind: 'handled',
		});
		Assert.ok(captured.standardErrorText.includes('Nothing has been remembered'));
	});

	test('expands a command read from the folder into a message for the model', async () => {
		const captured = await handle('/review src/cli.ts');

		Assert.deepEqual(captured.result, {
			kind: 'prompt',
			text: 'Review src/cli.ts.',
		});
	});

	test('says so at the terminal when there is no command of that name', async () => {
		const captured = await handle('/never-written');

		Assert.deepEqual(captured.result, {
			kind: 'handled',
		});
		Assert.ok(captured.standardErrorText.includes('There is no command called /never-written'));
	});

	test('answers a command code-agent knows itself even when the folder holds one of the same name', async () => {
		TemporaryFolder.writeFile(projectFolderPath, '.code-agent/commands/help.md', 'This must never be sent.\n');
		buildHandler();

		const captured = await handle('/help');

		Assert.deepEqual(captured.result, {
			kind: 'handled',
		});
		Assert.equal(captured.standardErrorText.includes('This must never be sent.'), false);
	});
});
