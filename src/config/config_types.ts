import { z } from 'zod';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	config_types — the shape of the doublure configuration
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The Zod schema of the doublure configuration. The configuration says which OpenAI API compatible endpoint to
 * call, which model to use on that endpoint, and how the command line interface behaves.
 */
export const doublureConfigSchema = z.object({
	/** The base address of the OpenAI API compatible endpoint, for example `http://127.0.0.1:1234/v1`. */
	baseUrl: z.string().min(1),
	/** The key sent to the OpenAI API compatible endpoint. Local endpoints accept any value. */
	apiKey: z.string().min(1),
	/** The identifier of the model to use on that endpoint, for example `qwen3.5-4b`. */
	modelName: z.string().min(1),
	/** The folder the agent reads files from and runs shell commands in. */
	workingDirectoryPath: z.string().min(1),
	/** The largest number of model turns a single request is allowed to take before doublure stops the loop. */
	maximumTurnCount: z.number().int().positive(),
	/** When true, doublure asks the user to confirm before it writes a file or runs a shell command. */
	isPermissionPromptEnabled: z.boolean(),
	/** When true, doublure prints the name and the arguments of every tool call as it happens. */
	isToolCallLoggingEnabled: z.boolean(),
});

/**
 * The doublure configuration, built from the command line options, the environment variables, and the defaults.
 */
export type DoublureConfig = z.infer<typeof doublureConfigSchema>;

/**
 * The default base address of the OpenAI API compatible endpoint. This is the address the LM Studio local server
 * listens on.
 */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:1234/v1';

/**
 * The default key sent to the OpenAI API compatible endpoint. The LM Studio local server does not check the key.
 */
export const DEFAULT_API_KEY = 'lm-studio';

/**
 * The default model identifier.
 *
 * `qwen3.5-4b` is the default because it calls a tool that takes several arguments reliably. The smaller
 * `google/gemma-4-e2b` answers well and calls a one-argument tool, but emits malformed JSON for the four-field
 * object that `memory_write` takes, so the call never reaches the tool and the memory silently fails to save.
 */
export const DEFAULT_MODEL_NAME = 'qwen3.5-4b';

/**
 * The default largest number of model turns a single request is allowed to take.
 */
export const DEFAULT_MAXIMUM_TURN_COUNT = 40;
