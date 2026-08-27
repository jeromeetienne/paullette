import Fs from 'node:fs';
import Path from 'node:path';

import { tool } from '@openai/agents';
import { z } from 'zod';

import { ToolPaths } from './tool_paths.ts';
import { type ToolContext } from './tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	FileTools — reading, writing, editing, and listing inside the working folder
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The largest number of characters of new content shown to the user when asking permission to write a file.
 */
const PERMISSION_DETAIL_CHARACTER_COUNT = 2000;

/**
 * The tools that read, write, edit, and list files inside the working folder.
 */
export class FileTools {
	/**
	 * Builds every file tool.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns The file tools.
	 */
	static createAll(context: ToolContext) {
		return [
			FileTools._createReadFile(context),
			FileTools._createWriteFile(context),
			FileTools._createEditFile(context),
			FileTools._createListDirectory(context),
		];
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Individual Tools
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds the tool that reads a file.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns The tool.
	 */
	private static _createReadFile(context: ToolContext) {
		return tool({
			name: 'read_file',
			description: 'Read a text file inside the working folder and return the whole of its content.',
			parameters: z.object({
				filePath: z.string().describe('The path of the file to read, relative to the working folder.'),
			}),
			execute: async ({ filePath }) => {
				try {
					const absolutePath = ToolPaths.resolveInside(context.workingDirectoryPath, filePath);
					const shortPath = ToolPaths.describe(context.workingDirectoryPath, absolutePath);
					context.logToolCall('read_file', shortPath);
					const text = await Fs.promises.readFile(absolutePath, 'utf8');
					return ToolPaths.capOutput(text);
				} catch (caughtError) {
					return FileTools._describeError(caughtError);
				}
			},
		});
	}

	/**
	 * Builds the tool that writes a file, asking the user first.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns The tool.
	 */
	private static _createWriteFile(context: ToolContext) {
		return tool({
			name: 'write_file',
			description:
				'Write a text file inside the working folder, making the folders above it when they are absent. ' +
				'This replaces the whole file. The user is asked before anything is written.',
			parameters: z.object({
				filePath: z.string().describe('The path of the file to write, relative to the working folder.'),
				content: z.string().describe('The whole new content of the file.'),
			}),
			execute: async ({ filePath, content }) => {
				try {
					const absolutePath = ToolPaths.resolveInside(context.workingDirectoryPath, filePath);
					const shortPath = ToolPaths.describe(context.workingDirectoryPath, absolutePath);
					context.logToolCall('write_file', shortPath);

					const decision = await context.permissionAsker.ask({
						toolName: 'write_file',
						summary: `write ${content.length} characters to ${shortPath}`,
						detail: content.slice(0, PERMISSION_DETAIL_CHARACTER_COUNT),
					});

					if (decision === 'refused') {
						return `The user refused to let you write ${shortPath}. Do not try again.`;
					}

					await Fs.promises.mkdir(Path.dirname(absolutePath), {
						recursive: true,
					});
					await Fs.promises.writeFile(absolutePath, content, 'utf8');
					return `Wrote ${content.length} characters to ${shortPath}.`;
				} catch (caughtError) {
					return FileTools._describeError(caughtError);
				}
			},
		});
	}

	/**
	 * Builds the tool that replaces one exact piece of text in a file, asking the user first.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns The tool.
	 */
	private static _createEditFile(context: ToolContext) {
		return tool({
			name: 'edit_file',
			description:
				'Replace one exact piece of text in a file inside the working folder. The old text must appear ' +
				'exactly once in the file. The user is asked before anything is changed.',
			parameters: z.object({
				filePath: z.string().describe('The path of the file to change, relative to the working folder.'),
				oldText: z.string().describe('The exact text to replace. It must appear exactly once in the file.'),
				newText: z.string().describe('The text to put in its place.'),
			}),
			execute: async ({ filePath, oldText, newText }) => {
				try {
					const absolutePath = ToolPaths.resolveInside(context.workingDirectoryPath, filePath);
					const shortPath = ToolPaths.describe(context.workingDirectoryPath, absolutePath);
					context.logToolCall('edit_file', shortPath);

					const currentText = await Fs.promises.readFile(absolutePath, 'utf8');
					const occurrenceCount = currentText.split(oldText).length - 1;

					if (occurrenceCount === 0) {
						return `That exact text does not appear in ${shortPath}. Read the file and try again.`;
					}
					if (occurrenceCount > 1) {
						return `That text appears ${occurrenceCount} times in ${shortPath}. Give more surrounding text so that it appears only once.`;
					}

					const decision = await context.permissionAsker.ask({
						toolName: 'edit_file',
						summary: `replace ${oldText.length} characters with ${newText.length} characters in ${shortPath}`,
						detail: `- ${oldText.slice(0, 500)}\n+ ${newText.slice(0, 500)}`,
					});

					if (decision === 'refused') {
						return `The user refused to let you change ${shortPath}. Do not try again.`;
					}

					await Fs.promises.writeFile(absolutePath, currentText.replace(oldText, newText), 'utf8');
					return `Changed ${shortPath}.`;
				} catch (caughtError) {
					return FileTools._describeError(caughtError);
				}
			},
		});
	}

	/**
	 * Builds the tool that lists what is in a folder.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns The tool.
	 */
	private static _createListDirectory(context: ToolContext) {
		return tool({
			name: 'list_directory',
			description: 'List the files and the folders inside a folder. Use "." for the working folder itself.',
			parameters: z.object({
				directoryPath: z
					.string()
					.describe('The path of the folder to list, relative to the working folder. Use "." for the top.'),
			}),
			execute: async ({ directoryPath }) => {
				try {
					const absolutePath = ToolPaths.resolveInside(context.workingDirectoryPath, directoryPath);
					const shortPath = ToolPaths.describe(context.workingDirectoryPath, absolutePath);
					context.logToolCall('list_directory', shortPath);

					const entries = await Fs.promises.readdir(absolutePath, {
						withFileTypes: true,
					});

					if (entries.length === 0) {
						return `${shortPath} is empty.`;
					}

					const lines = entries
						.map((entry) => (entry.isDirectory() === true ? `${entry.name}/` : entry.name))
						.sort();
					return ToolPaths.capOutput(lines.join('\n'));
				} catch (caughtError) {
					return FileTools._describeError(caughtError);
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
	 * A tool returns this rather than throwing, so that the model can try something else instead of the whole
	 * turn ending on one bad path.
	 *
	 * @param caughtError Whatever was thrown.
	 * @returns The sentence to give back to the model.
	 */
	private static _describeError(caughtError: unknown): string {
		const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
		return `That did not work: ${reason}`;
	}
}
