import { type InstructionDocument, type SkillDefinition } from '../config_folder/config_folder_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SystemPromptBuilder — assembles the instructions the agent is given on every turn
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Everything that goes into the system prompt. Every field except the working directory may be empty, which is
 * what a project with no `.paullette` content looks like.
 */
export type SystemPromptParts = {
	/** The folder the agent reads files from and runs shell commands in. */
	workingDirectoryPath: string;
	/** The instruction document read from `.paullette/CLAUDE.md`, or null when there is none. */
	instructionDocument: InstructionDocument | null;
	/** Every skill that was loaded. Only the name and the description of each one reach the prompt. */
	skillDefinitions: SkillDefinition[];
	/** The text of `.paullette/memory/MEMORY.md`, or null when nothing has been remembered yet. */
	memoryIndexText: string | null;
	/** True when the memory tools are there, which is what tells the agent it can remember things at all. */
	isMemoryAvailable: boolean;
};

/**
 * Assembles the instructions the agent is given on every turn.
 */
export class SystemPromptBuilder {
	/**
	 * Builds the system prompt.
	 *
	 * A skill contributes only its name and its description here, never its instructions. The agent reads the
	 * instructions of a skill by calling the `load_skill` tool, which is what keeps the prompt small enough for a
	 * two billion parameter local model to work with.
	 *
	 * @param parts Everything that goes into the system prompt.
	 * @returns The whole system prompt as one block of text.
	 */
	static build(parts: SystemPromptParts): string {
		const sections: string[] = [];

		sections.push(
			[
				'You are paullette, a coding assistant working on the command line.',
				'',
				`The working folder is ${parts.workingDirectoryPath}. Every relative path is read from there.`,
				'',
				'Use your tools to look at real files before you answer a question about the project. Never guess at',
				'the content of a file you have not read. Keep your answers short and say plainly when something',
				'did not work.',
				'',
				'When one of your tools can get you an answer, call it and then answer. Never tell the user to use',
				'a tool themselves, never say that a tool would be the way to find something out, and never',
				'describe what a tool would return instead of calling it. Some of your tools are other agents that',
				'know things you do not; if the name of a tool matches what is being asked for, that tool is where',
				'the answer is.',
			].join('\n'),
		);

		if (parts.instructionDocument !== null) {
			sections.push(
				[
					`# Project instructions, from ${parts.instructionDocument.filePath}`,
					'',
					'These come from the project itself. They outrank the general wording above.',
					'',
					parts.instructionDocument.text,
				].join('\n'),
			);
		}

		if (parts.skillDefinitions.length > 0) {
			const skillLines = parts.skillDefinitions.map((skillDefinition) => {
				return `- ${skillDefinition.name}: ${skillDefinition.description}`;
			});
			sections.push(
				[
					'# Skills',
					'',
					'Each line is a skill you can load. When one matches what you are asked to do, call the',
					'`load_skill` tool with its name to read its instructions, and then follow them.',
					'',
					...skillLines,
				].join('\n'),
			);
		}

		if (parts.isMemoryAvailable === true) {
			const memoryLines = [
				'# Memory',
				'',
				'When the user asks you to remember something, or tells you how they want you to work, save it',
				'with the `memory_write` tool. Save one fact at a time, and do not save what the code or the',
				'history of the project already says.',
			];

			if (parts.memoryIndexText !== null && parts.memoryIndexText.trim().length > 0) {
				memoryLines.push(
					'',
					'These are the things you were asked to remember in earlier sessions. Each line links to a',
					'file you can read with the `memory_read` tool when the line looks relevant.',
					'',
					parts.memoryIndexText.trim(),
				);
			}

			sections.push(memoryLines.join('\n'));
		}

		return sections.join('\n\n');
	}
}
