import { AgentDefinitionLoader } from './agent_definition_loader.ts';
import { CommandDefinitionLoader } from './command_definition_loader.ts';
import { DoublureFolderLocator } from './doublure_folder_locator.ts';
import { type DoublureFolderContent } from './doublure_folder_types.ts';
import { InstructionLoader } from './instruction_loader.ts';
import { SkillDefinitionLoader } from './skill_definition_loader.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	DoublureFolderReader — reads everything out of the .doublure folder at once
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Reads everything out of the `.doublure` folder at once.
 */
export class DoublureFolderReader {
	/**
	 * Finds the `.doublure` folder, makes it when it is absent, and reads everything in it.
	 *
	 * @param workingDirectoryPath The folder doublure was started in.
	 * @returns Everything read out of the `.doublure` folder.
	 */
	static read(workingDirectoryPath: string): DoublureFolderContent {
		const paths = DoublureFolderLocator.locate(workingDirectoryPath);
		DoublureFolderLocator.ensureFolders(paths);

		return {
			paths: paths,
			instructionDocument: InstructionLoader.load(paths.doublureFolderPath),
			agentDefinitions: AgentDefinitionLoader.loadAll(paths.doublureFolderPath),
			commandDefinitions: CommandDefinitionLoader.loadAll(paths.doublureFolderPath),
			skillDefinitions: SkillDefinitionLoader.loadAll(paths.doublureFolderPath),
		};
	}
}
