import Fs from 'node:fs';

import { type CommandDefinition } from 'paullette-core/config_folder/config_folder_types';
import { ShellTools } from 'paullette-core/tools/shell_tools';
import { ToolPaths } from 'paullette-core/tools/tool_paths';
import { type ToolContext } from 'paullette-core/tools/tool_types';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	CommandExpander — turns a slash command file into the message sent to the model
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Matches a shell command written between an exclamation mark and a pair of backticks.
 */
const SHELL_EXPRESSION = /!`([^`]+)`/g;

/**
 * Matches a file reference: an at sign followed by a path. A path stops at a space, a backtick, or a closing
 * bracket, so that a reference at the end of a sentence does not swallow the punctuation after it.
 */
const FILE_REFERENCE_EXPRESSION = /@([^\s`)\]]+)/g;

/**
 * Turns a slash command file into the message that is sent to the model.
 */
export class CommandExpander {
	/**
	 * Expands the three things a slash command file may hold: the arguments the user typed, the output of a
	 * shell command, and the content of a file.
	 *
	 * The shell commands go through the same permission asker as any other shell command. A command hidden
	 * inside a slash command file must never run without the user being shown it, because a slash command file
	 * can arrive in a project the same way any other file does.
	 *
	 * @param commandDefinition The slash command that was typed.
	 * @param argumentText Everything the user typed after the name of the command.
	 * @param toolContext The working folder, the permission asker, and the tool call logger.
	 * @returns The expanded text, ready to be sent as the message of the user.
	 */
	static async expand(
		commandDefinition: CommandDefinition,
		argumentText: string,
		toolContext: ToolContext,
	): Promise<string> {
		let expandedText = CommandExpander._expandArguments(commandDefinition.promptTemplate, argumentText);
		expandedText = await CommandExpander._expandShellCommands(expandedText, toolContext);
		expandedText = CommandExpander._expandFileReferences(expandedText, toolContext);
		return expandedText;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Replaces `$ARGUMENTS` with everything the user typed, and `$1` through `$9` with the separate words.
	 *
	 * @param templateText The body of the slash command file.
	 * @param argumentText Everything the user typed after the name of the command.
	 * @returns The text with the arguments put in.
	 */
	private static _expandArguments(templateText: string, argumentText: string): string {
		const words = argumentText.trim().split(/\s+/).filter((word) => word.length > 0);

		let expandedText = templateText.split('$ARGUMENTS').join(argumentText.trim());

		for (let position = 1; position <= 9; position += 1) {
			expandedText = expandedText.split(`$${position}`).join(words[position - 1] ?? '');
		}

		return expandedText;
	}

	/**
	 * Replaces every shell command with what that command printed.
	 *
	 * @param templateText The text so far.
	 * @param toolContext The working folder, the permission asker, and the tool call logger.
	 * @returns The text with the shell output put in.
	 */
	private static async _expandShellCommands(templateText: string, toolContext: ToolContext): Promise<string> {
		const matches = [...templateText.matchAll(SHELL_EXPRESSION)];
		let expandedText = templateText;

		for (const match of matches) {
			const wholeMatch = match[0];
			const commandText = match[1] ?? '';
			const output = await ShellTools.runShellCommand(toolContext, commandText);
			expandedText = expandedText.split(wholeMatch).join(output);
		}

		return expandedText;
	}

	/**
	 * Replaces every file reference with the content of that file.
	 *
	 * A reference to a file that cannot be read is left exactly as it was written, rather than being replaced by
	 * an error. An at sign is a common enough character that not every one of them is meant as a file.
	 *
	 * @param templateText The text so far.
	 * @param toolContext The working folder, the permission asker, and the tool call logger.
	 * @returns The text with the file content put in.
	 */
	private static _expandFileReferences(templateText: string, toolContext: ToolContext): string {
		const matches = [...templateText.matchAll(FILE_REFERENCE_EXPRESSION)];
		let expandedText = templateText;

		for (const match of matches) {
			const wholeMatch = match[0];
			const givenPath = match[1] ?? '';

			try {
				const absolutePath = ToolPaths.resolveInside(toolContext.workingDirectoryPath, givenPath);
				const fileText = Fs.readFileSync(absolutePath, 'utf8');
				expandedText = expandedText.split(wholeMatch).join(ToolPaths.capOutput(fileText));
			} catch {
				continue;
			}
		}

		return expandedText;
	}
}
