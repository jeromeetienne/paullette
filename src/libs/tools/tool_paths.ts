import Path from 'node:path';

import { MAXIMUM_TOOL_OUTPUT_CHARACTER_COUNT } from './tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ToolPaths — resolves a path a tool was given and keeps it inside the working folder
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a path a tool was given and keeps it inside the working folder.
 */
export class ToolPaths {
	/**
	 * Turns the path a tool was given into an absolute path inside the working folder.
	 *
	 * A path that points outside the working folder is refused. The model chooses these paths, and a small model
	 * asked to read a project file can easily produce `../../` or an absolute path somewhere else on the disk.
	 *
	 * @param workingDirectoryPath The folder every relative path is resolved against.
	 * @param givenPath The path the tool was given, absolute or relative.
	 * @returns The absolute path.
	 * @throws When the path points outside the working folder.
	 */
	static resolveInside(workingDirectoryPath: string, givenPath: string): string {
		const rootPath = Path.resolve(workingDirectoryPath);
		const resolvedPath = Path.resolve(rootPath, givenPath);
		const relativePath = Path.relative(rootPath, resolvedPath);

		const isOutside = relativePath.startsWith('..') === true || Path.isAbsolute(relativePath) === true;
		if (isOutside === true) {
			throw new Error(`${givenPath} is outside the working folder, so it cannot be reached`);
		}

		return resolvedPath;
	}

	/**
	 * Turns an absolute path back into the short form a person reads, relative to the working folder.
	 *
	 * @param workingDirectoryPath The folder every relative path is resolved against.
	 * @param absolutePath The absolute path.
	 * @returns The path relative to the working folder.
	 */
	static describe(workingDirectoryPath: string, absolutePath: string): string {
		return Path.relative(Path.resolve(workingDirectoryPath), absolutePath) || '.';
	}

	/**
	 * Cuts a tool result down to the largest size a tool may return, saying plainly when it cut something.
	 *
	 * @param text The whole text the tool produced.
	 * @returns The text, with a note appended when it was cut.
	 */
	static capOutput(text: string): string {
		if (text.length <= MAXIMUM_TOOL_OUTPUT_CHARACTER_COUNT) {
			return text;
		}

		const keptText = text.slice(0, MAXIMUM_TOOL_OUTPUT_CHARACTER_COUNT);
		const droppedCount = text.length - MAXIMUM_TOOL_OUTPUT_CHARACTER_COUNT;
		return `${keptText}\n\n[doublure cut this result short: ${droppedCount} more characters were not shown]`;
	}
}
