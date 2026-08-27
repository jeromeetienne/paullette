import { z } from 'zod';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	claude_folder_types — the shapes read out of a .claude folder
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Accepts either a comma separated string or a list of strings, and always produces a list of strings. The
 * frontmatter of a `.claude` file writes a list of tool names either way.
 */
const toolNameListSchema = z
	.union([z.string(), z.array(z.string())])
	.transform((value) => {
		const rawItems = Array.isArray(value) === true ? (value as string[]) : (value as string).split(',');
		return rawItems.map((item) => item.trim()).filter((item) => item.length > 0);
	});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Subagent Definitions
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The Zod schema of the frontmatter of a file in `.claude/agents`.
 */
export const agentFrontmatterSchema = z.object({
	/** The name of the subagent. Doublure falls back to the file name when this field is absent. */
	name: z.string().optional(),
	/** The sentence that tells the main agent when to call this subagent. */
	description: z.string().optional(),
	/** The names of the tools this subagent is allowed to call. An absent field means every tool. */
	tools: toolNameListSchema.optional(),
	/** The model this subagent asks for. Doublure ignores the value and uses the single configured model. */
	model: z.string().optional(),
});

/**
 * A subagent read from a file in `.claude/agents`. Doublure turns every subagent definition into a tool that the
 * main agent can call.
 */
export type AgentDefinition = {
	/** The name of the subagent, used as the name of the tool the main agent calls. */
	name: string;
	/** The sentence that tells the main agent when to call this subagent. */
	description: string;
	/** The names of the tools this subagent is allowed to call, or undefined when every tool is allowed. */
	toolNames: string[] | undefined;
	/** The system prompt of the subagent, which is the body of the file below the frontmatter. */
	systemPrompt: string;
	/** The absolute path of the file this subagent was read from. */
	filePath: string;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Slash Command Definitions
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The Zod schema of the frontmatter of a file in `.claude/commands`.
 */
export const commandFrontmatterSchema = z.object({
	/** The sentence shown next to the command name in the command list. */
	description: z.string().optional(),
	/** The hint shown to the user about the arguments the command expects. */
	'argument-hint': z.string().optional(),
	/** The names of the tools the command is allowed to call. Doublure records the value but does not apply it. */
	'allowed-tools': toolNameListSchema.optional(),
	/** The model the command asks for. Doublure ignores the value and uses the single configured model. */
	model: z.string().optional(),
});

/**
 * A slash command read from a file in `.claude/commands`. The user types the name of the command, and doublure
 * sends the body of the file to the model as the message of the user.
 */
export type CommandDefinition = {
	/** The name the user types after the slash, for example `review` or `git:commit` for a file in a subfolder. */
	name: string;
	/** The sentence shown next to the command name in the command list. */
	description: string;
	/** The hint shown to the user about the arguments the command expects. */
	argumentHint: string | undefined;
	/** The body of the file below the frontmatter, before any argument is substituted into it. */
	promptTemplate: string;
	/** The absolute path of the file this command was read from. */
	filePath: string;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Skill Definitions
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The Zod schema of the frontmatter of a `SKILL.md` file in `.claude/skills`.
 */
export const skillFrontmatterSchema = z.object({
	/** The name of the skill. Doublure falls back to the name of the folder when this field is absent. */
	name: z.string().optional(),
	/** The sentence that tells the agent when to load this skill. */
	description: z.string().optional(),
	/** The names of the tools the skill is allowed to call. Doublure records the value but does not apply it. */
	'allowed-tools': toolNameListSchema.optional(),
});

/**
 * A skill read from a `SKILL.md` file in `.claude/skills`. The agent sees the name and the description of every
 * skill in its system prompt, and reads the instructions only when it calls the `load_skill` tool.
 */
export type SkillDefinition = {
	/** The name of the skill, used as the argument of the `load_skill` tool. */
	name: string;
	/** The sentence that tells the agent when to load this skill. */
	description: string;
	/** The instructions of the skill, which is the body of the `SKILL.md` file below the frontmatter. */
	instructions: string;
	/** The absolute path of the folder that holds the `SKILL.md` file and the files it refers to. */
	folderPath: string;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Folder Locations And Aggregate Content
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The `.claude` folders doublure reads, in order of growing priority. A definition found in a later folder
 * replaces a definition of the same name found in an earlier folder.
 */
export type ClaudeFolderPaths = {
	/** The absolute paths of the `.claude` folders that exist, from the least specific to the most specific. */
	folderPaths: string[];
	/** The absolute path of the folder doublure treats as the root of the project. */
	projectRootPath: string;
};

/**
 * Everything doublure read out of the `.claude` folders.
 */
export type ClaudeFolderContent = {
	/** The `.claude` folders the content was read from. */
	paths: ClaudeFolderPaths;
	/** The text of every `CLAUDE.md` file that applies, from the least specific to the most specific. */
	instructionDocuments: InstructionDocument[];
	/** Every subagent definition, with the name of a subagent appearing at most once. */
	agentDefinitions: AgentDefinition[];
	/** Every slash command definition, with the name of a command appearing at most once. */
	commandDefinitions: CommandDefinition[];
	/** Every skill definition, with the name of a skill appearing at most once. */
	skillDefinitions: SkillDefinition[];
};

/**
 * One `CLAUDE.md` file, kept next to the path it was read from so that the system prompt can say where each
 * instruction came from.
 */
export type InstructionDocument = {
	/** The absolute path of the `CLAUDE.md` file. */
	filePath: string;
	/** The whole text of the file. */
	text: string;
};
