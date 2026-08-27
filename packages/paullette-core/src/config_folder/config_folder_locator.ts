import Fs from 'node:fs';
import Path from 'node:path';

import { type ConfigFolderPaths } from './config_folder_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ConfigFolderLocator — finds the project root and makes the .paullette folder
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The name of the folder paullette reads everything out of.
 */
export const CONFIG_FOLDER_NAME = '.paullette';

/**
 * The subfolders that always exist inside the `.paullette` folder.
 */
export const CONFIG_SUBFOLDER_NAMES = ['agents', 'commands', 'skills', 'memory', 'sessions'];

/**
 * Finds the project root and makes the `.paullette` folder.
 */
export class ConfigFolderLocator {
	/**
	 * Works out where the `.paullette` folder belongs.
	 *
	 * The project root is the nearest folder at or above the working folder that holds a `.git`, and the working
	 * folder itself when there is no `.git` anywhere above it. That makes paullette behave the same from any
	 * subfolder of a project, which is what a person expects from a command line tool.
	 *
	 * @param workingDirectoryPath The folder paullette was started in.
	 * @returns The project root and the path of the `.paullette` folder.
	 */
	static locate(workingDirectoryPath: string): ConfigFolderPaths {
		const projectRootPath = ConfigFolderLocator._findProjectRoot(workingDirectoryPath);

		return {
			projectRootPath: projectRootPath,
			configFolderPath: Path.join(projectRootPath, CONFIG_FOLDER_NAME),
		};
	}

	/**
	 * Makes the `.paullette` folder and its subfolders when they are absent.
	 *
	 * A fresh project works with no setup because of this. Nothing is overwritten: a folder that already exists
	 * is left exactly as it is.
	 *
	 * @param paths The project root and the path of the `.paullette` folder.
	 * @returns Nothing.
	 */
	static ensureFolders(paths: ConfigFolderPaths): void {
		Fs.mkdirSync(paths.configFolderPath, {
			recursive: true,
		});

		for (const subfolderName of CONFIG_SUBFOLDER_NAMES) {
			Fs.mkdirSync(Path.join(paths.configFolderPath, subfolderName), {
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
	 * @param workingDirectoryPath The folder paullette was started in.
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
