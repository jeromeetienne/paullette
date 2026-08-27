import Path from 'node:path';

import {
	DEFAULT_API_KEY,
	DEFAULT_BASE_URL,
	DEFAULT_MAXIMUM_TURN_COUNT,
	DEFAULT_MODEL_NAME,
	doublureConfigSchema,
	type DoublureConfig,
} from './config_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ConfigLoader — builds the doublure configuration from options, environment, and defaults
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
	/** When false, doublure never asks the user to confirm a file write or a shell command. */
	isPermissionPromptEnabled?: boolean;
	/** When true, doublure prints the name and the arguments of every tool call. */
	isToolCallLoggingEnabled?: boolean;
};

/**
 * Builds the doublure configuration.
 */
export class ConfigLoader {
	/**
	 * Builds the doublure configuration from the command line options, the environment variables, and the
	 * defaults, in that order of priority.
	 *
	 * The environment variables are `DOUBLURE_BASE_URL`, `DOUBLURE_API_KEY`, and `DOUBLURE_MODEL`. When a
	 * `DOUBLURE_` variable is absent, the matching `OPENAI_` variable is used instead, so that an existing
	 * OpenAI setup works without any extra step.
	 *
	 * @param overrides The values coming from the command line.
	 * @returns The validated doublure configuration.
	 */
	static load(overrides: ConfigLoaderOverrides = {}): DoublureConfig {
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

		return doublureConfigSchema.parse(config);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads an environment variable, preferring the `DOUBLURE_` name over the `OPENAI_` name.
	 *
	 * @param suffix The part of the variable name that follows the prefix, for example `BASE_URL`.
	 * @returns The value of the variable, or undefined when neither variable is set to a non empty value.
	 */
	private static _readEnvironment(suffix: string): string | undefined {
		const doublureValue = process.env[`DOUBLURE_${suffix}`];
		if (doublureValue !== undefined && doublureValue.length > 0) {
			return doublureValue;
		}

		const openaiValue = process.env[`OPENAI_${suffix}`];
		if (openaiValue !== undefined && openaiValue.length > 0) {
			return openaiValue;
		}

		return undefined;
	}
}
