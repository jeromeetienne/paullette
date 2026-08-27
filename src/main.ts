#!/usr/bin/env -S npx tsx
import Path from 'node:path';

import { run } from '@openai/agents';
import { Command } from 'commander';

import { AgentBuilder } from './libs/agent/agent_builder.ts';
import { ModelProvider } from './libs/agent/model_provider.ts';
import { SystemPromptBuilder } from './libs/agent/system_prompt_builder.ts';
import { PermissionPrompt } from './libs/cli/permission_prompt.ts';
import { ConfigLoader } from './libs/config/config_loader.ts';
import { type DoublureConfig } from './libs/config/config_types.ts';
import { DoublureFolderReader } from './libs/doublure_folder/doublure_folder_reader.ts';
import { type DoublureFolderContent } from './libs/doublure_folder/doublure_folder_types.ts';
import { MemoryStore } from './libs/memory/memory_store.ts';
import { MemoryTools } from './libs/tools/memory_tools.ts';
import { SkillTools } from './libs/tools/skill_tools.ts';
import { SubagentTools } from './libs/tools/subagent_tools.ts';
import { ToolRegistry, type BuiltTool } from './libs/tools/tool_registry.ts';
import { type ToolContext } from './libs/tools/tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Main — the command line entry point of doublure
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The options doublure accepts on the command line.
 */
type CommandLineOptions = {
	/** The prompt to answer in one turn before exiting, when the one-shot mode was asked for. */
	print?: string;
	/** True to print what was read out of the `.doublure` folder as JSON and exit. */
	list?: boolean;
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
	/** The configuration doublure is running with. */
	config: DoublureConfig;
	/** Everything read out of the `.doublure` folder. */
	content: DoublureFolderContent;
	/** The working folder, the permission asker, and the tool call logger. */
	toolContext: ToolContext;
	/** Every tool the main agent may call, including the skills and the subagents. */
	tools: BuiltTool[];
	/** The store holding everything remembered about this project. */
	memoryStore: MemoryStore;
};

/**
 * The command line entry point of doublure.
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
			.name('doublure')
			.description('A coding agent that reads a .doublure folder and runs on any OpenAI API compatible endpoint')
			.option('--print <prompt>', 'answer one prompt and exit, printing the answer to the standard output')
			.option('--list', 'print what was read out of the .doublure folder as JSON, and exit')
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

		if (options.list === true) {
			Main._printList(session);
			return;
		}

		if (options.print !== undefined) {
			await Main._runOneShot(session, options.print);
			return;
		}

		process.stderr.write('The interactive mode is not built yet. Use --print "<your question>" for now.\n');
		process.exitCode = 1;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Startup
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds the configuration, reads the `.doublure` folder, and assembles the tools.
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

		const content = DoublureFolderReader.read(config.workingDirectoryPath);
		const permissionPrompt = new PermissionPrompt(config.isPermissionPromptEnabled);

		const toolContext: ToolContext = {
			workingDirectoryPath: config.workingDirectoryPath,
			permissionAsker: permissionPrompt,
			logToolCall: (toolName, summary) => {
				if (config.isToolCallLoggingEnabled === true) {
					process.stderr.write(`doublure-tool: ${toolName} ${summary}\n`);
				}
			},
		};

		const memoryStore = new MemoryStore(Path.join(content.paths.doublureFolderPath, 'memory'));

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

		return {
			config: config,
			content: content,
			toolContext: toolContext,
			tools: tools,
			memoryStore: memoryStore,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Modes
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Prints what was read out of the `.doublure` folder as JSON, and returns.
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
			doublureFolderPath: content.paths.doublureFolderPath,
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
	 * Answers one prompt and returns.
	 *
	 * The answer goes to the standard output and nothing else does, so that a caller reading the standard output
	 * gets the answer on its own. Anything doublure has to say about its own working goes to the standard error.
	 *
	 * @param session Everything built at startup.
	 * @param prompt The prompt to answer.
	 * @returns Nothing.
	 */
	private static async _runOneShot(session: StartedSession, prompt: string): Promise<void> {
		const systemPrompt = SystemPromptBuilder.build({
			workingDirectoryPath: session.config.workingDirectoryPath,
			instructionDocument: session.content.instructionDocument,
			skillDefinitions: session.content.skillDefinitions,
			memoryIndexText: session.memoryStore.readIndex(),
			isMemoryAvailable: true,
		});

		const agent = AgentBuilder.build({
			modelName: session.config.modelName,
			systemPrompt: systemPrompt,
			tools: session.tools,
		});

		try {
			const result = await run(agent, prompt, {
				stream: true,
				maxTurns: session.config.maximumTurnCount,
			});

			for await (const textChunk of result.toTextStream()) {
				process.stdout.write(textChunk);
			}
			await result.completed;
			process.stdout.write('\n');
		} catch (caughtError) {
			const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
			process.stderr.write(`doublure could not answer: ${reason}\n`);
			process.exitCode = 1;
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Writes one line to the standard error saying what doublure can currently do.
	 *
	 * The verification runner reads this line to tell a part that is not built yet from a part that is built and
	 * wrong. Keep the shape in step with the `DoublureCapabilities` type in `test/libs/verification_types.ts`,
	 * which cannot import from here.
	 *
	 * @param session Everything built at startup.
	 * @returns Nothing.
	 */
	private static _reportCapabilities(session: StartedSession): void {
		const capabilities = {
			toolNames: session.tools.map((builtTool) => ('name' in builtTool ? builtTool.name : 'unknown')),
			hasMemory: true,
			hasSessions: false,
		};
		process.stderr.write(`doublure-capabilities: ${JSON.stringify(capabilities)}\n`);
	}
}

await Main.main(process.argv);
