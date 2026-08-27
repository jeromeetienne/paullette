import ChildProcess from 'node:child_process';
import Fs from 'node:fs';

import { tool } from '@openai/agents';
import { z } from 'zod';

import { ToolPaths } from './tool_paths.ts';
import { type ToolContext } from './tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SearchTools — finding files by name pattern and finding text inside files
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The largest number of file names `glob_files` returns.
 */
const MAXIMUM_MATCH_COUNT = 300;

/**
 * The folders never searched, because they hold generated or private files that swamp every result.
 */
const SKIPPED_FOLDER_NAMES = ['node_modules', '.git', 'dist'];

/**
 * The tools that find files by name pattern and find text inside files.
 */
export class SearchTools {
	/**
	 * Builds every search tool.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns The search tools.
	 */
	static createAll(context: ToolContext) {
		return [SearchTools._createGlobFiles(context), SearchTools._createGrepFiles(context)];
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Individual Tools
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds the tool that finds files whose path matches a pattern.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns The tool.
	 */
	private static _createGlobFiles(context: ToolContext) {
		return tool({
			name: 'glob_files',
			description:
				'Find files inside the working folder whose path matches a pattern, for example "**/*.ts" or ' +
				'"src/**/config*". Returns the matching paths, one per line.',
			parameters: z.object({
				pattern: z.string().describe('The pattern to match against the path of each file.'),
			}),
			execute: async ({ pattern }) => {
				try {
					context.logToolCall('glob_files', pattern);

					const matchedPaths: string[] = [];
					const foundPaths = Fs.promises.glob(pattern, {
						cwd: context.workingDirectoryPath,
					});

					for await (const foundPath of foundPaths) {
						const isSkipped = SKIPPED_FOLDER_NAMES.some((folderName) => {
							return foundPath.split('/').includes(folderName) === true;
						});
						if (isSkipped === true) {
							continue;
						}

						matchedPaths.push(foundPath);
						if (matchedPaths.length >= MAXIMUM_MATCH_COUNT) {
							break;
						}
					}

					if (matchedPaths.length === 0) {
						return `Nothing matches ${pattern}.`;
					}

					const countNote =
						matchedPaths.length >= MAXIMUM_MATCH_COUNT
							? `\n\n[paullette stopped at the first ${MAXIMUM_MATCH_COUNT} matches]`
							: '';
					return ToolPaths.capOutput(matchedPaths.sort().join('\n') + countNote);
				} catch (caughtError) {
					return SearchTools._describeError(caughtError);
				}
			},
		});
	}

	/**
	 * Builds the tool that finds text inside files.
	 *
	 * This shells out to `grep` rather than reading every file, because reading a whole project into memory to
	 * search it is slow and can exhaust the memory of the process on a large project.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns The tool.
	 */
	private static _createGrepFiles(context: ToolContext) {
		return tool({
			name: 'grep_files',
			description:
				'Find lines matching a regular expression in the files inside a folder. Returns each match as ' +
				'the file path, the line number, and the line. Use "." to search the whole working folder.',
			parameters: z.object({
				pattern: z.string().describe('The regular expression to search for.'),
				directoryPath: z
					.string()
					.describe('The folder to search, relative to the working folder. Use "." for the whole of it.'),
			}),
			execute: async ({ pattern, directoryPath }) => {
				try {
					const absolutePath = ToolPaths.resolveInside(context.workingDirectoryPath, directoryPath);
					const shortPath = ToolPaths.describe(context.workingDirectoryPath, absolutePath);
					context.logToolCall('grep_files', `${pattern} in ${shortPath}`);

					const excludeArguments = SKIPPED_FOLDER_NAMES.map((folderName) => {
						return `--exclude-dir=${folderName}`;
					});

					const grepRun = ChildProcess.spawnSync(
						'grep',
						['-rnI', '-E', ...excludeArguments, '--', pattern, '.'],
						{
							cwd: absolutePath,
							encoding: 'utf8',
							timeout: 30000,
							maxBuffer: 8 * 1024 * 1024,
						},
					);

					if (grepRun.status === 1) {
						return `Nothing in ${shortPath} matches ${pattern}.`;
					}
					if (grepRun.status !== 0) {
						return `The search did not work: ${(grepRun.stderr ?? '').trim() || 'grep failed'}`;
					}

					return ToolPaths.capOutput((grepRun.stdout ?? '').trim());
				} catch (caughtError) {
					return SearchTools._describeError(caughtError);
				}
			},
		});
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Turns a thrown error into a sentence the model can read and act on.
	 *
	 * @param caughtError Whatever was thrown.
	 * @returns The sentence to give back to the model.
	 */
	private static _describeError(caughtError: unknown): string {
		const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
		return `That did not work: ${reason}`;
	}
}
