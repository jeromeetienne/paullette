#!/usr/bin/env node
import Path from 'node:path';

import { type Agent } from '@openai/agents';
import { Command } from 'commander';

import { AgentBuilder } from 'paullette-core/agent/agent_builder';
import { ConversationSession } from 'paullette-core/agent/conversation_session';
import { ModelProvider } from 'paullette-core/agent/model_provider';
import { SystemPromptBuilder } from 'paullette-core/agent/system_prompt_builder';
import { OutputRenderer } from './terminal/output_renderer.ts';
import { PermissionPrompt } from './terminal/permission_prompt.ts';
import { ReadlineInterface } from './terminal/readline_interface.ts';
import { SlashCommandHandler } from './terminal/slash_command_handler.ts';
import { WebPermissionAsker } from 'paullette-web/server/web_permission_asker';
import { DEFAULT_WEB_HOST, DEFAULT_WEB_PORT, WebInterface } from 'paullette-web/web_interface';
import { ConfigLoader } from 'paullette-core/config_runtime/config_loader';
import { PackageVersionReader } from 'paullette-core/config_runtime/package_version_reader';
import { type PaulletteConfig } from 'paullette-core/config_runtime/config_types';
import { ConfigFolderReader } from 'paullette-core/config_folder/config_folder_reader';
import { type ConfigFolderContent } from 'paullette-core/config_folder/config_folder_types';
import { InputHistoryStore } from 'paullette-core/history/input_history_store';
import { SessionStore } from 'paullette-core/history/session_store';
import { MemoryStore } from 'paullette-core/memory/memory_store';
import { ModelContextProtocolSession } from 'paullette-core/model_context_protocol/model_context_protocol_session';
import { MemoryTools } from 'paullette-core/tools/memory_tools';
import { SkillTools } from 'paullette-core/tools/skill_tools';
import { SubagentTools } from 'paullette-core/tools/subagent_tools';
import { ToolRegistry, type BuiltTool } from 'paullette-core/tools/tool_registry';
import { type PermissionAsker, type ToolContext } from 'paullette-core/tools/tool_types';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Main — the command line entry point of paullette
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The options paullette accepts on the command line.
 */
type CommandLineOptions = {
	/** The prompt to answer in one turn before exiting, when the one-shot mode was asked for. */
	print?: string;
	/** True to print what was read out of the `.paullette` folder as JSON and exit. */
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
 * The options the `web` command accepts, on top of the ones every mode accepts.
 */
type WebCommandLineOptions = CommandLineOptions & {
	/** The port to listen on. */
	port?: string;
	/** The address to listen on. */
	host?: string;
};

/**
 * Everything built at startup and used by whichever mode was asked for.
 */
type StartedSession = {
	/** The configuration paullette is running with. */
	config: PaulletteConfig;
	/** Everything read out of the `.paullette` folder. */
	content: ConfigFolderContent;
	/** The working folder, the permission asker, and the tool call logger. */
	toolContext: ToolContext;
	/** Asks the user before a tool changes anything, at the terminal or in the browser. */
	permissionAsker: PermissionAsker;
	/** The store the past conversations are read from. */
	sessionStore: SessionStore;
	/** Every tool the main agent may call, including the memory, the skills, the subagents, and the servers. */
	tools: BuiltTool[];
	/** The running Model Context Protocol servers, and the tools they give the agent. */
	modelContextProtocolSession: ModelContextProtocolSession;
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
 * The command line entry point of paullette.
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
			.name('paullette')
			.description('A coding agent that reads a .paullette folder and runs on any OpenAI API compatible endpoint')
			.version(PackageVersionReader.read(), '-V, --version', 'print the version of paullette and exit')
			.option('--print <prompt>', 'answer one prompt and exit, printing the answer to the standard output')
			.option('--list', 'print what was read out of the .paullette folder as JSON, and exit')
			.option('--expand <command>', 'print the expanded text of a slash command without calling the model')
			.allowExcessArguments(false);
		Main._addSharedOptions(program);

		let webOptions: WebCommandLineOptions | null = null;
		const webCommand = program
			.command('web')
			.description('start a local web server and serve the web interface of paullette in a browser')
			.option('--port <number>', `the port to listen on, ${DEFAULT_WEB_PORT} by default`)
			.option('--host <address>', `the address to listen on, ${DEFAULT_WEB_HOST} by default`)
			.action(() => {
				webOptions = webCommand.opts<WebCommandLineOptions>();
			});
		Main._addSharedOptions(webCommand);

		program.parse(processArgv);

		const options: CommandLineOptions = {
			...program.opts<CommandLineOptions>(),
			...(webOptions ?? {}),
		};

		const config = ConfigLoader.load({
			baseUrl: options.baseUrl,
			apiKey: options.apiKey,
			modelName: options.model,
			maximumTurnCount: options.maxTurns === undefined ? undefined : Number(options.maxTurns),
			isPermissionPromptEnabled: options.yes === true ? false : undefined,
		});

		const permissionPrompt = webOptions === null ? new PermissionPrompt(config.isPermissionPromptEnabled) : null;
		const webPermissionAsker =
			webOptions === null ? null : new WebPermissionAsker(config.isPermissionPromptEnabled);

		const session = await Main._start(options, config, permissionPrompt ?? (webPermissionAsker as PermissionAsker));
		Main._reportWarnings(session);
		Main._reportCapabilities(session);

		if (webOptions === null) {
			Main._installInterruptHandler(session);
		}

		try {
			if (webOptions !== null && webPermissionAsker !== null) {
				await Main._runWeb(session, webPermissionAsker, webOptions);
				return;
			}

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

			await Main._runInteractive(session, permissionPrompt as PermissionPrompt);
		} finally {
			await session.modelContextProtocolSession.close();
		}
	}

	/**
	 * Adds the options every mode accepts to one command.
	 *
	 * They are added to the program itself and to the `web` command, so that `paullette --yes web` and
	 * `paullette web --yes` both work. A person should not have to remember which side of the command name an
	 * option belongs on.
	 *
	 * @param command The command to add the options to.
	 * @returns Nothing.
	 */
	private static _addSharedOptions(command: Command): void {
		command
			.option('--resume', 'carry on the newest conversation in .paullette/sessions instead of starting a new one')
			.option('--yes', 'approve every permission request instead of asking')
			.option('--model <name>', 'the identifier of the model to use')
			.option('--base-url <address>', 'the base address of the OpenAI API compatible endpoint')
			.option('--api-key <key>', 'the key sent to the endpoint')
			.option('--max-turns <count>', 'the largest number of model turns one request may take');
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Startup
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds the configuration, reads the `.paullette` folder, and assembles everything the modes share.
	 *
	 * The permission asker is built by the caller and handed in, because it is the one thing the modes do not
	 * share: the terminal asks at the terminal, and the web interface asks in the browser. Everything else built
	 * here is the same object whichever mode was asked for, which is what makes both front ends answer with the
	 * same agent.
	 *
	 * @param options What was given on the command line.
	 * @param config The configuration, already built, because the permission asker needed it first.
	 * @param permissionAsker Asks the user before a tool changes anything.
	 * @returns Everything the chosen mode needs.
	 */
	private static async _start(
		options: CommandLineOptions,
		config: PaulletteConfig,
		permissionAsker: PermissionAsker,
	): Promise<StartedSession> {
		ModelProvider.configure(config);

		const content = ConfigFolderReader.read(config.workingDirectoryPath);

		const toolContext: ToolContext = {
			workingDirectoryPath: config.workingDirectoryPath,
			permissionAsker: permissionAsker,
			logToolCall: (toolName, summary) => {
				if (config.isToolCallLoggingEnabled === true) {
					process.stderr.write(`paullette-tool: ${toolName} ${summary}\n`);
				}
			},
		};

		const memoryStore = new MemoryStore(Path.join(content.paths.configFolderPath, 'memory'));
		const sessionsFolderPath = Path.join(content.paths.configFolderPath, 'sessions');
		const sessionStore = new SessionStore(sessionsFolderPath);

		const resumedSession = options.resume === true ? sessionStore.loadNewestSession() : null;
		const storedSession = resumedSession ?? sessionStore.startSession(config.modelName);
		const conversationSession = new ConversationSession(sessionStore, sessionsFolderPath, storedSession);

		const modelContextProtocolSession = await ModelContextProtocolSession.start({
			projectRootPath: content.paths.projectRootPath,
			configFolderPath: content.paths.configFolderPath,
			workingDirectoryPath: config.workingDirectoryPath,
			toolContext: toolContext,
		});

		const ordinaryTools = ToolRegistry.createAll(toolContext);
		const tools = [
			...ordinaryTools,
			...modelContextProtocolSession.tools,
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
			permissionAsker: permissionAsker,
			sessionStore: sessionStore,
			tools: tools,
			modelContextProtocolSession: modelContextProtocolSession,
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
	 * Prints what was read out of the `.paullette` folder as JSON, and returns.
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
			modelContextProtocolServers: session.modelContextProtocolSession.startedServers.map(
				(startedServer) => ({
					name: startedServer.name,
				}),
			),
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

		process.stderr.write('That command is answered by paullette itself, so it expands to nothing.\n');
		process.exitCode = 1;
	}

	/**
	 * Answers one prompt and returns.
	 *
	 * The answer goes to the standard output and nothing else does, so that a caller reading the standard output
	 * gets the answer on its own. Anything paullette has to say about its own working goes to the standard error.
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
				(turnEvent) => {
					if (turnEvent.kind === 'text') {
						process.stdout.write(turnEvent.delta);
					}
				},
			);
			process.stdout.write('\n');
		} catch (caughtError) {
			const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
			process.stderr.write(`paullette could not answer: ${reason}\n`);
			process.exitCode = 1;
		}
	}

	/**
	 * Runs the read, answer, and repeat loop at the terminal.
	 *
	 * @param session Everything built at startup.
	 * @param permissionPrompt The prompt the loop hands its readline interface to.
	 * @returns Nothing.
	 */
	private static async _runInteractive(
		session: StartedSession,
		permissionPrompt: PermissionPrompt,
	): Promise<void> {
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
			permissionPrompt: permissionPrompt,
			inputHistoryStore: session.inputHistoryStore,
			projectRootPath: session.content.paths.projectRootPath,
		});

		await readlineInterface.run();
	}

	/**
	 * Starts the web server and serves the web interface until the process is stopped.
	 *
	 * The address is written to the standard output, because it is the answer to what was asked for, and
	 * everything paullette says about its own working goes to the standard error. That is the same split the
	 * one-shot mode follows.
	 *
	 * @param session Everything built at startup.
	 * @param webPermissionAsker The asker the browser answers, which is the one inside the tool context.
	 * @param webOptions The port and the address given on the command line.
	 * @returns Nothing.
	 */
	private static async _runWeb(
		session: StartedSession,
		webPermissionAsker: WebPermissionAsker,
		webOptions: WebCommandLineOptions,
	): Promise<void> {
		const host = webOptions.host ?? DEFAULT_WEB_HOST;
		const port = webOptions.port === undefined ? DEFAULT_WEB_PORT : Number(webOptions.port);

		if (Number.isInteger(port) === false || port < 0 || port > 65535) {
			process.stderr.write(`${webOptions.port} is not a port number.\n`);
			process.exitCode = 1;
			return;
		}

		if (host !== DEFAULT_WEB_HOST && host !== 'localhost') {
			process.stderr.write(
				`paullette-warning: listening on ${host} rather than ${DEFAULT_WEB_HOST}. ` +
					'Anyone who can reach that address can make paullette run shell commands on this machine.\n',
			);
		}

		const startedWebInterface = await WebInterface.start({
			agent: session.agent,
			conversationSession: session.conversationSession,
			sessionStore: session.sessionStore,
			permissionAsker: webPermissionAsker,
			modelName: session.config.modelName,
			workingDirectoryPath: session.config.workingDirectoryPath,
			maximumTurnCount: session.config.maximumTurnCount,
			host: host,
			port: port,
		});

		process.stdout.write(`paullette web interface is served at ${startedWebInterface.address}\n`);

		await new Promise<void>((resolve) => {
			let isStopping = false;

			const stop = () => {
				if (isStopping === true) {
					return;
				}
				isStopping = true;

				void startedWebInterface.close().then(() => {
					OutputRenderer.writeNotice(
						`paullette stopped serving. The conversation is in ${session.conversationSession.sessionFilePath}`,
					);
					resolve();
				});
			};

			process.on('SIGINT', stop);
			process.on('SIGTERM', stop);
		});
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Makes the interrupt key end paullette without losing the conversation, when there is no interactive loop and
	 * no web server to handle it. The interactive loop handles its own, so that a first press can warn and a
	 * second can leave, and the web server handles its own so that it can close every open stream and let the
	 * Model Context Protocol servers be stopped in turn.
	 *
	 * Nothing has to be written here, because the conversation is written to disk before the model is called
	 * rather than only after it answers.
	 *
	 * @param session Everything built at startup.
	 * @returns Nothing.
	 */
	private static _installInterruptHandler(session: StartedSession): void {
		process.on('SIGINT', () => {
			void session.modelContextProtocolSession.close();
			OutputRenderer.writeNotice(
				`\npaullette stopped. The conversation so far is in ${session.conversationSession.sessionFilePath}`,
			);
			process.exit(130);
		});
	}

	/**
	 * Writes every Model Context Protocol warning to the standard error.
	 *
	 * A server that did not start is said out loud and paullette carries on, so that a person sees which server
	 * is missing instead of quietly losing its tools.
	 *
	 * @param session Everything built at startup.
	 * @returns Nothing.
	 */
	private static _reportWarnings(session: StartedSession): void {
		for (const warning of session.modelContextProtocolSession.warnings) {
			process.stderr.write(`paullette-warning: ${warning.message}\n`);
		}
	}

	/**
	 * Writes one line to the standard error saying what paullette can currently do.
	 *
	 * The verification runner reads this line to tell a part that is not built yet from a part that is built and
	 * wrong. Keep the shape in step with the `PaulletteCapabilities` type in `test/libs/verification_types.ts`,
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
			hasWebInterface: true,
			modelContextProtocolServerNames: session.modelContextProtocolSession.serverNames,
		};
		process.stderr.write(`paullette-capabilities: ${JSON.stringify(capabilities)}\n`);
	}
}

await Main.main(process.argv);
