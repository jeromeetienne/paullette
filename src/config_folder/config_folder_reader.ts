import { AgentDefinitionLoader } from './agent_definition_loader.ts';
import { CommandDefinitionLoader } from './command_definition_loader.ts';
import { ConfigFolderLocator } from './config_folder_locator.ts';
import { type ConfigFolderContent } from './config_folder_types.ts';
import { InstructionLoader } from './instruction_loader.ts';
import { SkillDefinitionLoader } from './skill_definition_loader.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ConfigFolderReader — reads everything out of the .paullette folder at once
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Reads everything out of the `.paullette` folder at once.
 */
export class ConfigFolderReader {
	/**
	 * Finds the `.paullette` folder, makes it when it is absent, and reads everything in it.
	 *
	 * @param workingDirectoryPath The folder paullette was started in.
	 * @returns Everything read out of the `.paullette` folder.
	 */
	static read(workingDirectoryPath: string): ConfigFolderContent {
		const paths = ConfigFolderLocator.locate(workingDirectoryPath);
		ConfigFolderLocator.ensureFolders(paths);

		return {
			paths: paths,
			instructionDocument: InstructionLoader.load(paths.configFolderPath),
			agentDefinitions: AgentDefinitionLoader.loadAll(paths.configFolderPath),
			commandDefinitions: CommandDefinitionLoader.loadAll(paths.configFolderPath),
			skillDefinitions: SkillDefinitionLoader.loadAll(paths.configFolderPath),
		};
	}
}
