import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	TemporaryFolder — makes a folder for one test and removes it afterwards
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The first part of the name of every folder made here, so that a folder left behind by a test that was killed
 * can be recognised and removed by hand.
 */
const FOLDER_NAME_PREFIX = 'code-agent-unit-';

/**
 * Every folder path this class has made. `remove` refuses a path that is not in this set.
 */
const madeFolderPaths = new Set<string>();

/**
 * Makes a folder for one test and removes it afterwards.
 *
 * A unit test that touches the disk writes into one of these folders and never into the repository, so that a
 * test cannot leave a file behind and cannot pass by reading a file another test wrote.
 */
export class TemporaryFolder {
	/**
	 * Makes an empty folder inside the temporary folder of the operating system.
	 *
	 * @returns The absolute path of the new folder.
	 */
	static make(): string {
		const folderPath = Fs.mkdtempSync(Path.join(Os.tmpdir(), FOLDER_NAME_PREFIX));
		const realFolderPath = Fs.realpathSync(folderPath);
		madeFolderPaths.add(realFolderPath);
		return realFolderPath;
	}

	/**
	 * Removes a folder this class made, with everything inside it.
	 *
	 * A path this class did not make is refused rather than removed. A test that removes a folder built from a
	 * path it computed itself is one mistake away from removing the repository.
	 *
	 * @param folderPath The absolute path of the folder to remove.
	 * @returns Nothing.
	 * @throws When the folder was not made by this class.
	 */
	static remove(folderPath: string): void {
		if (madeFolderPaths.has(folderPath) === false) {
			throw new Error(`${folderPath} was not made by TemporaryFolder, so it will not be removed`);
		}

		Fs.rmSync(folderPath, {
			recursive: true,
			force: true,
		});
		madeFolderPaths.delete(folderPath);
	}

	/**
	 * Writes a file inside a folder, making the folders above it when they are absent.
	 *
	 * @param folderPath The absolute path of the folder the path is relative to.
	 * @param relativePath The path of the file, relative to that folder.
	 * @param fileText The whole content of the file.
	 * @returns The absolute path of the file that was written.
	 */
	static writeFile(folderPath: string, relativePath: string, fileText: string): string {
		const filePath = Path.join(folderPath, relativePath);
		Fs.mkdirSync(Path.dirname(filePath), {
			recursive: true,
		});
		Fs.writeFileSync(filePath, fileText, 'utf8');
		return filePath;
	}
}
