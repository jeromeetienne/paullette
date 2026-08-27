import Fs from 'node:fs';
import Path from 'node:path';

import { type DoublureFolderPaths } from './doublure_folder_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	DoublureFolderLocator — finds the project root and makes the .doublure folder
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The name of the folder doublure reads everything out of.
 */
export const DOUBLURE_FOLDER_NAME = '.doublure';

/**
 * The subfolders that always exist inside the `.doublure` folder.
 */
export const DOUBLURE_SUBFOLDER_NAMES = ['agents', 'commands', 'skills', 'memory', 'sessions'];

/**
 * Finds the project root and makes the `.doublure` folder.
 */
export class DoublureFolderLocator {
	/**
	 * Works out where the `.doublure` folder belongs.
	 *
	 * The project root is the nearest folder at or above the working folder that holds a `.git`, and the working
	 * folder itself when there is no `.git` anywhere above it. That makes doublure behave the same from any
	 * subfolder of a project, which is what a person expects from a command line tool.
	 *
	 * @param workingDirectoryPath The folder doublure was started in.
	 * @returns The project root and the path of the `.doublure` folder.
	 */
	static locate(workingDirectoryPath: string): DoublureFolderPaths {
		const projectRootPath = DoublureFolderLocator._findProjectRoot(workingDirectoryPath);

		return {
			projectRootPath: projectRootPath,
			doublureFolderPath: Path.join(projectRootPath, DOUBLURE_FOLDER_NAME),
		};
	}

	/**
	 * Makes the `.doublure` folder and its subfolders when they are absent.
	 *
	 * A fresh project works with no setup because of this. Nothing is overwritten: a folder that already exists
	 * is left exactly as it is.
	 *
	 * @param paths The project root and the path of the `.doublure` folder.
	 * @returns Nothing.
	 */
	static ensureFolders(paths: DoublureFolderPaths): void {
		Fs.mkdirSync(paths.doublureFolderPath, {
			recursive: true,
		});

		for (const subfolderName of DOUBLURE_SUBFOLDER_NAMES) {
			Fs.mkdirSync(Path.join(paths.doublureFolderPath, subfolderName), {
				recursive: true,
			});
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Walks up from the working folder looking for a `.git`.
	 *
	 * @param workingDirectoryPath The folder doublure was started in.
	 * @returns The nearest folder holding a `.git`, or the working folder when there is none.
	 */
	private static _findProjectRoot(workingDirectoryPath: string): string {
		let currentPath = Path.resolve(workingDirectoryPath);

		while (true) {
			if (Fs.existsSync(Path.join(currentPath, '.git')) === true) {
				return currentPath;
			}

			const parentPath = Path.dirname(currentPath);
			if (parentPath === currentPath) {
				return Path.resolve(workingDirectoryPath);
			}
			currentPath = parentPath;
		}
	}
}
