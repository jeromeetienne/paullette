import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';

import { CONFIG_FOLDER_NAME } from '../config_folder/config_folder_locator.ts';
import {
	serverEntrySchema,
	serversFileSchema,
	type ModelContextProtocolConfigReadResult,
	type ModelContextProtocolServerDefinition,
	type ModelContextProtocolWarning,
} from './model_context_protocol_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ModelContextProtocolConfigReader — reads the declared Model Context Protocol servers
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The name of the file at the project root that holds nothing but a `mcpServers` map. This is the name Claude
 * Code uses, kept unchanged so that a project already set up for Claude Code works with no extra file.
 */
export const SERVERS_FILE_NAME = '.mcp.json';

/**
 * The name of the settings file inside a `.paullette` folder.
 */
export const SETTINGS_FILE_NAME = 'settings.json';

/**
 * Where the Model Context Protocol servers are declared.
 */
export type ModelContextProtocolConfigReadRequest = {
	/** The absolute path of the folder paullette treats as the root of the project. */
	projectRootPath: string;
	/** The absolute path of the `.paullette` folder of the project. */
	configFolderPath: string;
	/** The absolute path of the `.paullette` folder of the user, which defaults to the one in the home folder. */
	userConfigFolderPath?: string;
};

/**
 * Reads the Model Context Protocol servers out of the three places they may be declared, and merges them.
 */
export class ModelContextProtocolConfigReader {
	/**
	 * Reads every declared Model Context Protocol server.
	 *
	 * The three sources are read lowest first: the `mcpServers` field of the settings file of the user, then the
	 * `.mcp.json` file at the project root, then the `mcpServers` field of the settings file of the project. A
	 * later source wins over an earlier one when both declare the same server name, so the settings file of the
	 * project wins over everything, and the settings file of the user is the weakest. That order is what lets a
	 * project override a server the user set up once for every project.
	 *
	 * @param request Where the servers are declared.
	 * @returns Every server that was declared, and every warning about something that could not be read.
	 */
	static readAll(request: ModelContextProtocolConfigReadRequest): ModelContextProtocolConfigReadResult {
		const userConfigFolderPath =
			request.userConfigFolderPath ?? Path.join(Os.homedir(), CONFIG_FOLDER_NAME);

		const sourceFilePaths = [
			Path.join(userConfigFolderPath, SETTINGS_FILE_NAME),
			Path.join(request.projectRootPath, SERVERS_FILE_NAME),
			Path.join(request.configFolderPath, SETTINGS_FILE_NAME),
		];

		const warnings: ModelContextProtocolWarning[] = [];
		const definitionsByName = new Map<string, ModelContextProtocolServerDefinition>();

		for (const sourceFilePath of sourceFilePaths) {
			ModelContextProtocolConfigReader._readOneFile(sourceFilePath, definitionsByName, warnings);
		}

		return {
			serverDefinitions: [...definitionsByName.values()],
			warnings: warnings,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads one file and puts every server it declares into the map, overwriting a server of the same name that
	 * an earlier file declared.
	 *
	 * A file that is absent is not a warning, because none of the three files has to exist. Everything else that
	 * goes wrong is a warning and never a thrown error, so that one bad file never stops paullette from starting.
	 *
	 * @param sourceFilePath The absolute path of the file to read.
	 * @param definitionsByName The map every server found so far is kept in, changed in place.
	 * @param warnings The warning list, appended to in place.
	 * @returns Nothing.
	 */
	private static _readOneFile(
		sourceFilePath: string,
		definitionsByName: Map<string, ModelContextProtocolServerDefinition>,
		warnings: ModelContextProtocolWarning[],
	): void {
		if (Fs.existsSync(sourceFilePath) === false) {
			return;
		}

		let fileText: string;
		try {
			fileText = Fs.readFileSync(sourceFilePath, 'utf8');
		} catch (caughtError) {
			warnings.push({
				serverName: null,
				message: `${sourceFilePath} could not be read: ${ModelContextProtocolConfigReader._toReason(caughtError)}`,
			});
			return;
		}

		let parsedJson: unknown;
		try {
			parsedJson = JSON.parse(fileText);
		} catch (caughtError) {
			warnings.push({
				serverName: null,
				message: `${sourceFilePath} is not valid JSON, so no Model Context Protocol server was read from it: ${ModelContextProtocolConfigReader._toReason(caughtError)}`,
			});
			return;
		}

		const parsedFile = serversFileSchema.safeParse(parsedJson);
		if (parsedFile.success === false) {
			warnings.push({
				serverName: null,
				message: `${sourceFilePath} does not hold a usable mcpServers field, so no Model Context Protocol server was read from it`,
			});
			return;
		}

		const rawEntries = parsedFile.data.mcpServers ?? {};
		for (const [serverName, rawEntry] of Object.entries(rawEntries)) {
			const parsedEntry = serverEntrySchema.safeParse(rawEntry);
			if (parsedEntry.success === false) {
				warnings.push({
					serverName: serverName,
					message: `The Model Context Protocol server ${serverName} in ${sourceFilePath} was skipped, because its entry names neither a command to run nor a url to reach`,
				});
				continue;
			}

			definitionsByName.set(serverName, {
				name: serverName,
				entry: parsedEntry.data,
				filePath: sourceFilePath,
			});
		}
	}

	/**
	 * Turns whatever was thrown into a sentence.
	 *
	 * @param caughtError What was thrown.
	 * @returns The sentence.
	 */
	private static _toReason(caughtError: unknown): string {
		return caughtError instanceof Error ? caughtError.message : String(caughtError);
	}
}
