import Fs from 'node:fs';
import Path from 'node:path';

import { agentFrontmatterSchema, type AgentDefinition } from './config_folder_types.ts';
import { FrontmatterParser } from './frontmatter_parser.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AgentDefinitionLoader — reads the subagents out of .code-agent/agents
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Reads the subagents out of `.code-agent/agents`.
 */
export class AgentDefinitionLoader {
	/**
	 * Reads every subagent definition.
	 *
	 * A file whose frontmatter cannot be understood is skipped rather than throwing, because one bad file in a
	 * folder copied from another project must not stop code-agent from starting.
	 *
	 * @param configFolderPath The absolute path of the `.code-agent` folder.
	 * @returns Every subagent definition, with the name of a subagent appearing at most once.
	 */
	static loadAll(configFolderPath: string): AgentDefinition[] {
		const agentsFolderPath = Path.join(configFolderPath, 'agents');
		if (Fs.existsSync(agentsFolderPath) === false) {
			return [];
		}

		const definitionsByName = new Map<string, AgentDefinition>();

		const fileNames = Fs.readdirSync(agentsFolderPath).filter((fileName) => fileName.endsWith('.md') === true);
		for (const fileName of fileNames.sort()) {
			const filePath = Path.join(agentsFolderPath, fileName);
			const definition = AgentDefinitionLoader._loadOne(filePath, fileName);
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
	 * Reads one subagent definition out of one file.
	 *
	 * @param filePath The absolute path of the file.
	 * @param fileName The name of the file, used as the name of the subagent when the frontmatter gives none.
	 * @returns The subagent definition, or null when the file holds nothing usable.
	 */
	private static _loadOne(filePath: string, fileName: string): AgentDefinition | null {
		const parsed = FrontmatterParser.parse(Fs.readFileSync(filePath, 'utf8'));
		const frontmatterResult = agentFrontmatterSchema.safeParse(parsed.frontmatter);
		const frontmatter = frontmatterResult.success === true ? frontmatterResult.data : {};

		if (parsed.body.length === 0) {
			return null;
		}

		const name = frontmatter.name ?? fileName.replace(/\.md$/, '');

		return {
			name: name,
			description: frontmatter.description ?? `The ${name} subagent.`,
			toolNames: frontmatter.tools,
			systemPrompt: parsed.body,
			filePath: filePath,
		};
	}
}
