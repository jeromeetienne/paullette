import Fs from 'node:fs';
import Path from 'node:path';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PackageVersionReader — reads the version of code-agent out of its own package.json
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

/**
 * The text printed for the version when no `package.json` could be read.
 */
export const UNKNOWN_VERSION = 'unknown';

/**
 * Reads the version of code-agent out of the `package.json` of code-agent itself.
 */
export class PackageVersionReader {
	/**
	 * Reads the version of code-agent.
	 *
	 * The `package.json` is found by walking up from the folder holding this file, so that the version is the
	 * same whether code-agent runs from the TypeScript source in `src` or from the built JavaScript in `dist`.
	 *
	 * @returns The `version` field of the `package.json` of code-agent, or `unknown` when it cannot be read.
	 */
	static read(): string {
		const filePath = PackageVersionReader.findPackageJsonFilePath(__dirname);
		if (filePath === null) {
			return UNKNOWN_VERSION;
		}

		return PackageVersionReader.readVersionFrom(filePath);
	}

	/**
	 * Walks up from a folder until it finds a folder holding a `package.json`.
	 *
	 * @param startFolderPath The folder to start the walk from.
	 * @returns The path of the `package.json` that was found, or null when the walk reached the root folder.
	 */
	static findPackageJsonFilePath(startFolderPath: string): string | null {
		let folderPath = Path.resolve(startFolderPath);

		for (;;) {
			const filePath = Path.join(folderPath, 'package.json');
			if (Fs.existsSync(filePath) === true) {
				return filePath;
			}

			const parentFolderPath = Path.dirname(folderPath);
			if (parentFolderPath === folderPath) {
				return null;
			}

			folderPath = parentFolderPath;
		}
	}

	/**
	 * Reads the `version` field out of one `package.json`.
	 *
	 * A `package.json` that cannot be read, cannot be parsed, or holds no `version` field gives `unknown` rather
	 * than an error, because printing the version must never stop code-agent from starting.
	 *
	 * @param filePath The path of the `package.json` to read.
	 * @returns The `version` field, or `unknown` when there is none to read.
	 */
	static readVersionFrom(filePath: string): string {
		let fileText: string;
		try {
			fileText = Fs.readFileSync(filePath, 'utf8');
		} catch {
			return UNKNOWN_VERSION;
		}

		let parsedValue: unknown;
		try {
			parsedValue = JSON.parse(fileText);
		} catch {
			return UNKNOWN_VERSION;
		}

		if (typeof parsedValue !== 'object' || parsedValue === null) {
			return UNKNOWN_VERSION;
		}

		const versionValue = (parsedValue as Record<string, unknown>).version;
		if (typeof versionValue !== 'string' || versionValue.length === 0) {
			return UNKNOWN_VERSION;
		}

		return versionValue;
	}
}
