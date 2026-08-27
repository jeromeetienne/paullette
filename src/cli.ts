#!/usr/bin/env node
import Path from 'node:path';

import { type Agent } from '@openai/agents';
import { Command } from 'commander';

import { AgentBuilder } from './agent/agent_builder.ts';
import { ModelProvider } from './agent/model_provider.ts';
import { SystemPromptBuilder } from './agent/system_prompt_builder.ts';
import { ConversationSession } from './terminal/conversation_session.ts';
import { OutputRenderer } from './terminal/output_renderer.ts';
import { PermissionPrompt } from './terminal/permission_prompt.ts';
import { ReadlineInterface } from './terminal/readline_interface.ts';
import { SlashCommandHandler } from './terminal/slash_command_handler.ts';
import { ConfigLoader } from './config/config_loader.ts';
import { PackageVersionReader } from './config/package_version_reader.ts';
import { type CodeAgentConfig } from './config/config_types.ts';
import { ConfigFolderReader } from './config_folder/config_folder_reader.ts';
import { type ConfigFolderContent } from './config_folder/config_folder_types.ts';
import { InputHistoryStore } from './history/input_history_store.ts';
import { SessionStore } from './history/session_store.ts';
import { MemoryStore } from './memory/memory_store.ts';
import { MemoryTools } from './tools/memory_tools.ts';
import { SkillTools } from './tools/skill_tools.ts';
import { SubagentTools } from './tools/subagent_tools.ts';
import { ToolRegistry, type BuiltTool } from './tools/tool_registry.ts';
import { type ToolContext } from './tools/tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Main — the command line entry point of code-agent
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The options code-agent accepts on the command line.
 */
type CommandLineOptions = {
	/** The prompt to answer in one turn before exiting, when the one-shot mode was asked for. */
	print?: string;
	/** True to print what was read out of the `.code-agent` folder as JSON and exit. */
	list?: boolean;
	/** The slash command to expand and print without calling the model, for example `/greet World`. */
	expand?: string;
	/** True to carry on the newest conversation instead of starting a new one. */
	resume?: boolean;
	/** True to approve every permission request instead of asking. */
	yes?: boolean;
	/** The identifier of the model to use, overriding the environment and the default. */
	model?: string;
	/** The base address of the OpenAI API compatible endpoint. */
	baseUrl?: string;
	/** The key sent to the endpoint. */
	apiKey?: string;
	/** The largest number of model turns one request may take. */
	maxTurns?: string;
};

/**
 * Everything built at startup and used by whichever mode was asked for.
 */
type StartedSession = {
	/** The configuration code-agent is running with. */
	config: CodeAgentConfig;
	/** Everything read out of the `.code-agent` folder. */
	content: ConfigFolderContent;
	/** The working folder, the permission asker, and the tool call logger. */
	toolContext: ToolContext;
	/** Asks the user before a tool changes anything. */
	permissionPrompt: PermissionPrompt;
	/** Every tool the main agent may call, including the memory, the skills, and the subagents. */
	tools: BuiltTool[];
	/** The agent that answers. */
	agent: Agent;
	/** The store holding everything remembered about this project. */
	memoryStore: MemoryStore;
	/** The conversation being held, either newly started or read back from disk. */
	conversationSession: ConversationSession;
	/** Deals with a typed line that starts with a slash. */
	slashCommandHandler: SlashCommandHandler;
	/** Remembers the typed lines between runs. */
	inputHistoryStore: InputHistoryStore;
};

/**
 * The command line entry point of code-agent.
 */
class Main {
	/**
	 * Reads the command line, builds everything, and does what was asked.
	 *
	 * @param processArgv The whole argument list of the process, starting with the runtime and the script.
	 * @returns Nothing.
	 */
	static async main(processArgv: string[]): Promise<void> {
		const program = new Command();
		program
			.name('code-agent')
			.description('A coding agent that reads a .code-agent folder and runs on any OpenAI API compatible endpoint')
			.version(PackageVersionReader.read(), '-V, --version', 'print the version of code-agent and exit')
			.option('--print <prompt>', 'answer one prompt and exit, printing the answer to the standard output')
			.option('--list', 'print what was read out of the .code-agent folder as JSON, and exit')
			.option('--expand <command>', 'print the expanded text of a slash command without calling the model')
			.option('--resume', 'carry on the newest conversation in .code-agent/sessions instead of starting a new one')
			.option('--yes', 'approve every permission request instead of asking')
			.option('--model <name>', 'the identifier of the model to use')
			.option('--base-url <address>', 'the base address of the OpenAI API compatible endpoint')
			.option('--api-key <key>', 'the key sent to the endpoint')
			.option('--max-turns <count>', 'the largest number of model turns one request may take')
			.allowExcessArguments(false);

		program.parse(processArgv);
		const options = program.opts<CommandLineOptions>();

		const session = Main._start(options);
		Main._reportCapabilities(session);
		Main._installInterruptHandler(session);

		if (options.list === true) {
			Main._printList(session);
			return;
		}

		if (options.expand !== undefined) {
			await Main._printExpandedCommand(session, options.expand);
			return;
		}

		if (options.print !== undefined) {
			await Main._runOneShot(session, options.print);
			return;
		}

		await Main._runInteractive(session);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Startup
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds the configuration, reads the `.code-agent` folder, and assembles everything the modes share.
	 *
	 * @param options What was given on the command line.
	 * @returns Everything the chosen mode needs.
	 */
	private static _start(options: CommandLineOptions): StartedSession {
		const config = ConfigLoader.load({
			baseUrl: options.baseUrl,
			apiKey: options.apiKey,
			modelName: options.model,
			maximumTurnCount: options.maxTurns === undefined ? undefined : Number(options.maxTurns),
			isPermissionPromptEnabled: options.yes === true ? false : undefined,
		});

		ModelProvider.configure(config);

		const content = ConfigFolderReader.read(config.workingDirectoryPath);
		const permissionPrompt = new PermissionPrompt(config.isPermissionPromptEnabled);

		const toolContext: ToolContext = {
			workingDirectoryPath: config.workingDirectoryPath,
			permissionAsker: permissionPrompt,
			logToolCall: (toolName, summary) => {
				if (config.isToolCallLoggingEnabled === true) {
					process.stderr.write(`code-agent-tool: ${toolName} ${summary}\n`);
				}
			},
		};

		const memoryStore = new MemoryStore(Path.join(content.paths.configFolderPath, 'memory'));
		const sessionsFolderPath = Path.join(content.paths.configFolderPath, 'sessions');
		const sessionStore = new SessionStore(sessionsFolderPath);

		const resumedSession = options.resume === true ? sessionStore.loadNewestSession() : null;
		const storedSession = resumedSession ?? sessionStore.startSession(config.modelName);
		const conversationSession = new ConversationSession(sessionStore, sessionsFolderPath, storedSession);

		const ordinaryTools = ToolRegistry.createAll(toolContext);
		const tools = [
			...ordinaryTools,
			...MemoryTools.createAll(toolContext, memoryStore),
			...SkillTools.createAll(toolContext, content.skillDefinitions),
			...SubagentTools.createAll({
				agentDefinitions: content.agentDefinitions,
				modelName: config.modelName,
				allTools: ordinaryTools,
			}),
		];

		const agent = AgentBuilder.build({
			modelName: config.modelName,
			systemPrompt: SystemPromptBuilder.build({
				workingDirectoryPath: config.workingDirectoryPath,
				instructionDocument: content.instructionDocument,
				skillDefinitions: content.skillDefinitions,
				memoryIndexText: memoryStore.readIndex(),
				isMemoryAvailable: true,
			}),
			tools: tools,
		});

		return {
			config: config,
			content: content,
			toolContext: toolContext,
			permissionPrompt: permissionPrompt,
			tools: tools,
			agent: agent,
			memoryStore: memoryStore,
			conversationSession: conversationSession,
			slashCommandHandler: new SlashCommandHandler(
				content,
				toolContext,
				memoryStore,
				conversationSession,
				config.modelName,
			),
			inputHistoryStore: new InputHistoryStore(
				Path.join(content.paths.configFolderPath, 'input_history.txt'),
			),
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Modes
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Prints what was read out of the `.code-agent` folder as JSON, and returns.
	 *
	 * The shape printed here is the contract the verification runner reads. It is typed as `ListOutput` in
	 * `test/libs/verification_types.ts`, which cannot import from here.
	 *
	 * @param session Everything built at startup.
	 * @returns Nothing.
	 */
	private static _printList(session: StartedSession): void {
		const content = session.content;

		const listOutput = {
			projectRootPath: content.paths.projectRootPath,
			configFolderPath: content.paths.configFolderPath,
			instructions:
				content.instructionDocument === null
					? null
					: {
							filePath: content.instructionDocument.filePath,
							characterCount: content.instructionDocument.text.length,
						},
			agents: content.agentDefinitions.map((agentDefinition) => ({
				name: agentDefinition.name,
				description: agentDefinition.description,
				toolNames: agentDefinition.toolNames ?? null,
			})),
			commands: content.commandDefinitions.map((commandDefinition) => ({
				name: commandDefinition.name,
				description: commandDefinition.description,
				argumentHint: commandDefinition.argumentHint ?? null,
			})),
			skills: content.skillDefinitions.map((skillDefinition) => ({
				name: skillDefinition.name,
				description: skillDefinition.description,
			})),
		};

		process.stdout.write(`${JSON.stringify(listOutput, null, '\t')}\n`);
	}

	/**
	 * Expands one slash command and prints the result, without calling the model.
	 *
	 * @param session Everything built at startup.
	 * @param commandLine The slash command as the user would type it, for example `/greet World`.
	 * @returns Nothing.
	 */
	private static async _printExpandedCommand(session: StartedSession, commandLine: string): Promise<void> {
		const outcome = await session.slashCommandHandler.handle(commandLine);

		if (outcome.kind === 'prompt') {
			process.stdout.write(`${outcome.text}\n`);
			return;
		}

		if (outcome.kind === 'notACommand') {
			process.stderr.write(`${commandLine} is not a slash command. A slash command starts with a slash.\n`);
			process.exitCode = 1;
			return;
		}

		process.stderr.write('That command is answered by code-agent itself, so it expands to nothing.\n');
		process.exitCode = 1;
	}

	/**
	 * Answers one prompt and returns.
	 *
	 * The answer goes to the standard output and nothing else does, so that a caller reading the standard output
	 * gets the answer on its own. Anything code-agent has to say about its own working goes to the standard error.
	 *
	 * @param session Everything built at startup.
	 * @param prompt The prompt to answer.
	 * @returns Nothing.
	 */
	private static async _runOneShot(session: StartedSession, prompt: string): Promise<void> {
		try {
			await session.conversationSession.runTurn(
				session.agent,
				prompt,
				session.config.maximumTurnCount,
				(textChunk) => process.stdout.write(textChunk),
			);
			process.stdout.write('\n');
		} catch (caughtError) {
			const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
			process.stderr.write(`code-agent could not answer: ${reason}\n`);
			process.exitCode = 1;
		}
	}

	/**
	 * Runs the read, answer, and repeat loop at the terminal.
	 *
	 * @param session Everything built at startup.
	 * @returns Nothing.
	 */
	private static async _runInteractive(session: StartedSession): Promise<void> {
		if (process.stdin.isTTY !== true) {
			process.stderr.write(
				'There is no terminal to read from. Use --print "<your question>" to ask one question.\n',
			);
			process.exitCode = 1;
			return;
		}

		const readlineInterface = new ReadlineInterface({
			config: session.config,
			agent: session.agent,
			conversationSession: session.conversationSession,
			slashCommandHandler: session.slashCommandHandler,
			permissionPrompt: session.permissionPrompt,
			inputHistoryStore: session.inputHistoryStore,
			projectRootPath: session.content.paths.projectRootPath,
		});

		await readlineInterface.run();
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Makes the interrupt key end code-agent without losing the conversation, when there is no interactive loop to
	 * handle it. The interactive loop handles its own, so that a first press can warn and a second can leave.
	 *
	 * Nothing has to be written here, because the conversation is written to disk before the model is called
	 * rather than only after it answers.
	 *
	 * @param session Everything built at startup.
	 * @returns Nothing.
	 */
	private static _installInterruptHandler(session: StartedSession): void {
		process.on('SIGINT', () => {
			OutputRenderer.writeNotice(
				`\ncode-agent stopped. The conversation so far is in ${session.conversationSession.sessionFilePath}`,
			);
			process.exit(130);
		});
	}

	/**
	 * Writes one line to the standard error saying what code-agent can currently do.
	 *
	 * The verification runner reads this line to tell a part that is not built yet from a part that is built and
	 * wrong. Keep the shape in step with the `CodeAgentCapabilities` type in `test/libs/verification_types.ts`,
	 * which cannot import from here.
	 *
	 * @param session Everything built at startup.
	 * @returns Nothing.
	 */
	private static _reportCapabilities(session: StartedSession): void {
		const capabilities = {
			toolNames: session.tools.map((builtTool) => ('name' in builtTool ? builtTool.name : 'unknown')),
			hasMemory: true,
			hasSessions: true,
		};
		process.stderr.write(`code-agent-capabilities: ${JSON.stringify(capabilities)}\n`);
	}
}

await Main.main(process.argv);
