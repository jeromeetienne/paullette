import Fs from 'node:fs';
import Path from 'node:path';

import { skillFrontmatterSchema, type SkillDefinition } from './config_folder_types.ts';
import { FrontmatterParser } from './frontmatter_parser.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SkillDefinitionLoader — reads the skills out of .paullette/skills
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The name of the file that holds the instructions of a skill.
 */
const SKILL_FILE_NAME = 'SKILL.md';

/**
 * Reads the skills out of `.paullette/skills`.
 */
export class SkillDefinitionLoader {
	/**
	 * Reads every skill definition. Each skill is a folder holding a `SKILL.md`.
	 *
	 * @param configFolderPath The absolute path of the `.paullette` folder.
	 * @returns Every skill definition, with the name of a skill appearing at most once.
	 */
	static loadAll(configFolderPath: string): SkillDefinition[] {
		const skillsFolderPath = Path.join(configFolderPath, 'skills');
		if (Fs.existsSync(skillsFolderPath) === false) {
			return [];
		}

		const definitionsByName = new Map<string, SkillDefinition>();
		const entries = Fs.readdirSync(skillsFolderPath, {
			withFileTypes: true,
		});

		for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
			if (entry.isDirectory() === false) {
				continue;
			}

			const folderPath = Path.join(skillsFolderPath, entry.name);
			const definition = SkillDefinitionLoader._loadOne(folderPath, entry.name);
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
	 * Reads one skill definition out of one folder.
	 *
	 * @param folderPath The absolute path of the folder of the skill.
	 * @param folderName The name of the folder, used as the name of the skill when the frontmatter gives none.
	 * @returns The skill definition, or null when the folder holds no usable `SKILL.md`.
	 */
	private static _loadOne(folderPath: string, folderName: string): SkillDefinition | null {
		const skillFilePath = Path.join(folderPath, SKILL_FILE_NAME);
		if (Fs.existsSync(skillFilePath) === false) {
			return null;
		}

		const parsed = FrontmatterParser.parse(Fs.readFileSync(skillFilePath, 'utf8'));
		const frontmatterResult = skillFrontmatterSchema.safeParse(parsed.frontmatter);
		const frontmatter = frontmatterResult.success === true ? frontmatterResult.data : {};

		if (parsed.body.length === 0) {
			return null;
		}

		const name = frontmatter.name ?? folderName;

		return {
			name: name,
			description: frontmatter.description ?? `The ${name} skill.`,
			instructions: parsed.body,
			folderPath: folderPath,
		};
	}
}
