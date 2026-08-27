import ChildProcess from 'node:child_process';

import { tool } from '@openai/agents';
import { z } from 'zod';

import { ToolPaths } from './tool_paths.ts';
import { type ToolContext } from './tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ShellTools — running a shell command in the working folder
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * How long a shell command may run before it is stopped. Without this, one command that waits forever ends the
 * whole session.
 */
const SHELL_TIMEOUT_MILLISECONDS = 120000;

/**
 * The largest amount of output a shell command may produce before it is stopped.
 */
const SHELL_MAXIMUM_BUFFER_BYTE_COUNT = 8 * 1024 * 1024;

/**
 * The tool that runs a shell command in the working folder.
 */
export class ShellTools {
	/**
	 * Builds every shell tool.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns The shell tools.
	 */
	static createAll(context: ToolContext) {
		return [ShellTools._createRunShellCommand(context)];
	}

	/**
	 * Runs a shell command in the working folder, asking the user first.
	 *
	 * This is used both by the tool below and by the slash command expansion, which turns a `!` command into its
	 * output. Both go through the same permission asker, so that a command hidden inside a slash command file
	 * cannot run without the user seeing it.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @param commandText The shell command to run.
	 * @returns What the command printed, or the reason it did not run.
	 */
	static async runShellCommand(context: ToolContext, commandText: string): Promise<string> {
		context.logToolCall('run_shell_command', commandText);

		const decision = await context.permissionAsker.ask({
			toolName: 'run_shell_command',
			summary: `run a shell command in ${context.workingDirectoryPath}`,
			detail: commandText,
		});

		if (decision === 'refused') {
			return 'The user refused to let you run that command. Do not try again.';
		}

		const commandRun = ChildProcess.spawnSync(commandText, {
			cwd: context.workingDirectoryPath,
			encoding: 'utf8',
			shell: true,
			timeout: SHELL_TIMEOUT_MILLISECONDS,
			maxBuffer: SHELL_MAXIMUM_BUFFER_BYTE_COUNT,
		});

		if (commandRun.error !== undefined) {
			return `The command did not run: ${commandRun.error.message}`;
		}

		const standardOutput = (commandRun.stdout ?? '').trim();
		const standardError = (commandRun.stderr ?? '').trim();

		const parts: string[] = [`exit status: ${commandRun.status}`];
		if (standardOutput.length > 0) {
			parts.push(`standard output:\n${standardOutput}`);
		}
		if (standardError.length > 0) {
			parts.push(`standard error:\n${standardError}`);
		}
		if (standardOutput.length === 0 && standardError.length === 0) {
			parts.push('the command printed nothing');
		}

		return ToolPaths.capOutput(parts.join('\n'));
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Individual Tools
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds the tool that runs a shell command.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns The tool.
	 */
	private static _createRunShellCommand(context: ToolContext) {
		return tool({
			name: 'run_shell_command',
			description:
				'Run a shell command in the working folder and return its exit status and its output. The user ' +
				'is asked before the command runs. Prefer read_file, glob_files, and grep_files when one of them ' +
				'does what you need.',
			parameters: z.object({
				command: z.string().describe('The shell command to run.'),
			}),
			execute: async ({ command }) => {
				try {
					return await ShellTools.runShellCommand(context, command);
				} catch (caughtError) {
					const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
					return `That did not work: ${reason}`;
				}
			},
		});
	}
}
