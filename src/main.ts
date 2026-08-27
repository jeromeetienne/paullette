#!/usr/bin/env -S npx tsx
import { run } from '@openai/agents';
import { Command } from 'commander';

import { AgentBuilder } from './libs/agent/agent_builder.ts';
import { ModelProvider } from './libs/agent/model_provider.ts';
import { SystemPromptBuilder } from './libs/agent/system_prompt_builder.ts';
import { ConfigLoader } from './libs/config/config_loader.ts';
import { type DoublureConfig } from './libs/config/config_types.ts';

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
 * The command line entry point of doublure.
 */
class Main {
	/**
	 * Reads the command line, builds the agent, and does what was asked.
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
			.option('--yes', 'approve every permission request instead of asking')
			.option('--model <name>', 'the identifier of the model to use')
			.option('--base-url <address>', 'the base address of the OpenAI API compatible endpoint')
			.option('--api-key <key>', 'the key sent to the endpoint')
			.option('--max-turns <count>', 'the largest number of model turns one request may take')
			.allowExcessArguments(false);

		program.parse(processArgv);
		const options = program.opts<CommandLineOptions>();

		const config = ConfigLoader.load({
			baseUrl: options.baseUrl,
			apiKey: options.apiKey,
			modelName: options.model,
			maximumTurnCount: options.maxTurns === undefined ? undefined : Number(options.maxTurns),
			isPermissionPromptEnabled: options.yes === true ? false : undefined,
		});

		ModelProvider.configure(config);

		if (options.print !== undefined) {
			await Main._runOneShot(config, options.print);
			return;
		}

		process.stderr.write('The interactive mode is not built yet. Use --print "<your question>" for now.\n');
		process.exitCode = 1;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Answers one prompt and returns.
	 *
	 * The answer goes to the standard output and nothing else does, so that a caller reading the standard output
	 * gets the answer on its own. Anything doublure has to say about its own working goes to the standard error.
	 *
	 * @param config The configuration to run with.
	 * @param prompt The prompt to answer.
	 * @returns Nothing.
	 */
	private static async _runOneShot(config: DoublureConfig, prompt: string): Promise<void> {
		const systemPrompt = SystemPromptBuilder.build({
			workingDirectoryPath: config.workingDirectoryPath,
			instructionDocument: null,
			skillDefinitions: [],
			memoryIndexText: null,
		});

		const agent = AgentBuilder.build({
			modelName: config.modelName,
			systemPrompt: systemPrompt,
			tools: [],
		});

		try {
			const result = await run(agent, prompt, {
				stream: true,
				maxTurns: config.maximumTurnCount,
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
}

await Main.main(process.argv);
