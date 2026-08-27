import { tool } from '@openai/agents';
import { z } from 'zod';

import { type SkillDefinition } from '../doublure_folder/doublure_folder_types.ts';
import { ToolPaths } from './tool_paths.ts';
import { type ToolContext } from './tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SkillTools — lets the agent read the instructions of a skill when it needs them
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Lets the agent read the instructions of a skill when it needs them.
 *
 * Only the name and the description of each skill sit in the system prompt. The instructions arrive through this
 * tool, which is what keeps the prompt small enough for a small local model to work with.
 */
export class SkillTools {
	/**
	 * Builds the skill tool, or nothing at all when the project has no skills.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @param skillDefinitions Every skill read out of the `.doublure` folder.
	 * @returns The skill tools, which is an empty list when there are no skills.
	 */
	static createAll(context: ToolContext, skillDefinitions: SkillDefinition[]) {
		if (skillDefinitions.length === 0) {
			return [];
		}

		return [SkillTools._createLoadSkill(context, skillDefinitions)];
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Individual Tools
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds the tool that returns the instructions of one skill.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @param skillDefinitions Every skill read out of the `.doublure` folder.
	 * @returns The tool.
	 */
	private static _createLoadSkill(context: ToolContext, skillDefinitions: SkillDefinition[]) {
		const knownNames = skillDefinitions.map((skillDefinition) => skillDefinition.name).join(', ');

		return tool({
			name: 'load_skill',
			description:
				`Read the instructions of one of the skills of this project and follow them. The skills are: ${knownNames}.`,
			parameters: z.object({
				skillName: z.string().describe(`The name of the skill to read. One of: ${knownNames}.`),
			}),
			execute: async ({ skillName }) => {
				context.logToolCall('load_skill', skillName);

				const skillDefinition = skillDefinitions.find((candidate) => {
					return candidate.name.toLowerCase() === skillName.trim().toLowerCase();
				});

				if (skillDefinition === undefined) {
					return `There is no skill called ${skillName}. The skills are: ${knownNames}.`;
				}

				return ToolPaths.capOutput(
					`These are the instructions of the ${skillDefinition.name} skill. Follow them.\n\n` +
						`Its files are in ${skillDefinition.folderPath}.\n\n${skillDefinition.instructions}`,
				);
			},
		});
	}
}
