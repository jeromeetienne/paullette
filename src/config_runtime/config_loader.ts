import Path from 'node:path';

import {
	DEFAULT_API_KEY,
	DEFAULT_BASE_URL,
	DEFAULT_MAXIMUM_TURN_COUNT,
	DEFAULT_MODEL_NAME,
	paulletteConfigSchema,
	type PaulletteConfig,
} from './config_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ConfigLoader — builds the paullette configuration from options, environment, and defaults
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The values the command line is allowed to set. Every value is optional: a value that is absent falls back to an
 * environment variable, and then to a default.
 */
export type ConfigLoaderOverrides = {
	/** The base address of the OpenAI API compatible endpoint. */
	baseUrl?: string;
	/** The key sent to the OpenAI API compatible endpoint. */
	apiKey?: string;
	/** The identifier of the model to use. */
	modelName?: string;
	/** The folder the agent reads files from and runs shell commands in. */
	workingDirectoryPath?: string;
	/** The largest number of model turns a single request is allowed to take. */
	maximumTurnCount?: number;
	/** When false, paullette never asks the user to confirm a file write or a shell command. */
	isPermissionPromptEnabled?: boolean;
	/** When true, paullette prints the name and the arguments of every tool call. */
	isToolCallLoggingEnabled?: boolean;
};

/**
 * Builds the paullette configuration.
 */
export class ConfigLoader {
	/**
	 * Builds the paullette configuration from the command line options, the environment variables, and the
	 * defaults, in that order of priority.
	 *
	 * The environment variables are `PAULLETTE_BASE_URL`, `PAULLETTE_API_KEY`, and `PAULLETTE_MODEL`. When a
	 * `PAULLETTE_` variable is absent, the matching `OPENAI_` variable is used instead, so that an existing
	 * OpenAI setup works without any extra step.
	 *
	 * @param overrides The values coming from the command line.
	 * @returns The validated paullette configuration.
	 */
	static load(overrides: ConfigLoaderOverrides = {}): PaulletteConfig {
		const workingDirectoryPath = Path.resolve(overrides.workingDirectoryPath ?? process.cwd());

		const config = {
			baseUrl: overrides.baseUrl ?? ConfigLoader._readEnvironment('BASE_URL') ?? DEFAULT_BASE_URL,
			apiKey: overrides.apiKey ?? ConfigLoader._readEnvironment('API_KEY') ?? DEFAULT_API_KEY,
			modelName: overrides.modelName ?? ConfigLoader._readEnvironment('MODEL') ?? DEFAULT_MODEL_NAME,
			workingDirectoryPath: workingDirectoryPath,
			maximumTurnCount: overrides.maximumTurnCount ?? DEFAULT_MAXIMUM_TURN_COUNT,
			isPermissionPromptEnabled: overrides.isPermissionPromptEnabled ?? true,
			isToolCallLoggingEnabled: overrides.isToolCallLoggingEnabled ?? true,
		};

		return paulletteConfigSchema.parse(config);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads an environment variable, preferring the `PAULLETTE_` name over the `OPENAI_` name.
	 *
	 * @param suffix The part of the variable name that follows the prefix, for example `BASE_URL`.
	 * @returns The value of the variable, or undefined when neither variable is set to a non empty value.
	 */
	private static _readEnvironment(suffix: string): string | undefined {
		const paulletteValue = process.env[`PAULLETTE_${suffix}`];
		if (paulletteValue !== undefined && paulletteValue.length > 0) {
			return paulletteValue;
		}

		const openaiValue = process.env[`OPENAI_${suffix}`];
		if (openaiValue !== undefined && openaiValue.length > 0) {
			return openaiValue;
		}

		return undefined;
	}
}
