import Fs from 'node:fs';
import Path from 'node:path';

import { commandFrontmatterSchema, type CommandDefinition } from './config_folder_types.ts';
import { FrontmatterParser } from './frontmatter_parser.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	CommandDefinitionLoader — reads the slash commands out of .paullette/commands
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Reads the slash commands out of `.paullette/commands`.
 */
export class CommandDefinitionLoader {
	/**
	 * Reads every slash command definition, including the ones in subfolders.
	 *
	 * A command in a subfolder is named after its path with a colon between the parts, so
	 * `commands/git/commit.md` is typed as `/git:commit`. That is how Claude Code names them, and a `.paullette`
	 * folder is most often a copy of a `.claude` folder.
	 *
	 * @param configFolderPath The absolute path of the `.paullette` folder.
	 * @returns Every slash command definition, with the name of a command appearing at most once.
	 */
	static loadAll(configFolderPath: string): CommandDefinition[] {
		const commandsFolderPath = Path.join(configFolderPath, 'commands');
		if (Fs.existsSync(commandsFolderPath) === false) {
			return [];
		}

		const definitionsByName = new Map<string, CommandDefinition>();
		const filePaths = CommandDefinitionLoader._findMarkdownFiles(commandsFolderPath);

		for (const filePath of filePaths.sort()) {
			const relativePath = Path.relative(commandsFolderPath, filePath);
			const name = relativePath.replace(/\.md$/, '').split(Path.sep).join(':');
			const definition = CommandDefinitionLoader._loadOne(filePath, name);
			if (definition !== null) {
				definitionsByName.set(definition.name, definition);
			}
		}

		return [...definitionsByName.values()];
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Finds every Markdown file at or below a folder.
	 *
	 * @param folderPath The folder to look in.
	 * @returns The absolute path of every Markdown file found.
	 */
	private static _findMarkdownFiles(folderPath: string): string[] {
		const foundPaths: string[] = [];
		const entries = Fs.readdirSync(folderPath, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const entryPath = Path.join(folderPath, entry.name);
			if (entry.isDirectory() === true) {
				foundPaths.push(...CommandDefinitionLoader._findMarkdownFiles(entryPath));
				continue;
			}
			if (entry.name.endsWith('.md') === true) {
				foundPaths.push(entryPath);
			}
		}

		return foundPaths;
	}

	/**
	 * Reads one slash command definition out of one file.
	 *
	 * @param filePath The absolute path of the file.
	 * @param name The name the user types after the slash.
	 * @returns The slash command definition, or null when the file holds nothing usable.
	 */
	private static _loadOne(filePath: string, name: string): CommandDefinition | null {
		const parsed = FrontmatterParser.parse(Fs.readFileSync(filePath, 'utf8'));
		const frontmatterResult = commandFrontmatterSchema.safeParse(parsed.frontmatter);
		const frontmatter = frontmatterResult.success === true ? frontmatterResult.data : {};

		if (parsed.body.length === 0) {
			return null;
		}

		return {
			name: name,
			description: frontmatter.description ?? `The ${name} command.`,
			argumentHint: frontmatter['argument-hint'],
			promptTemplate: parsed.body,
			filePath: filePath,
		};
	}
}
