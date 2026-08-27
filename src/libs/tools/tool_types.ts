///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	tool_types — what every tool is given, and how a tool asks the user for permission
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * What the user answered when a tool asked for permission.
 */
export type PermissionDecision = 'allowed' | 'refused';

/**
 * What a tool tells the user it is about to do.
 */
export type PermissionRequest = {
	/** The name of the tool asking, which is also what an "always allow" answer is remembered against. */
	toolName: string;
	/** One line saying what is about to happen, for example `write 412 characters to notes.md`. */
	summary: string;
	/** The text the user should see before deciding, for example the shell command or the new file content. */
	detail: string | undefined;
};

/**
 * Asks the user whether a tool may do what it is about to do.
 *
 * This is an interface rather than a class so that the `tools` folder never has to import from the `cli` folder.
 * The command line side implements it, and a check can implement it differently.
 */
export interface PermissionAsker {
	/**
	 * Asks the user whether a tool may do what it is about to do.
	 *
	 * @param request What the tool is about to do.
	 * @returns Whether the tool may go ahead.
	 */
	ask(request: PermissionRequest): Promise<PermissionDecision>;
}

/**
 * Everything a tool needs in order to run. One of these is built once at startup and given to every tool.
 */
export type ToolContext = {
	/** The folder every relative path is resolved against, and the folder no tool may reach outside of. */
	workingDirectoryPath: string;
	/** Asked before a tool changes anything on disk or runs a shell command. */
	permissionAsker: PermissionAsker;
	/**
	 * Writes one line about a tool call to the standard error.
	 *
	 * It goes to the standard error and never to the standard output, so that a caller reading the standard
	 * output gets the answer of the model on its own.
	 */
	logToolCall: (toolName: string, summary: string) => void;
};

/**
 * The largest number of characters any tool returns to the model. A local model has a small context window, and
 * one unbounded file or one unbounded command output would fill it and end the conversation.
 */
export const MAXIMUM_TOOL_OUTPUT_CHARACTER_COUNT = 30000;
