import { type ConfigFolderContent } from 'paullette-core/config_folder/config_folder_types';
import { type MemoryStore } from 'paullette-core/memory/memory_store';
import { type ToolContext } from 'paullette-core/tools/tool_types';
import { CommandExpander } from './command_expander.ts';
import { type ConversationSession } from 'paullette-core/agent/conversation_session';
import { OutputRenderer } from './output_renderer.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SlashCommandHandler — deals with a line the user typed that starts with a slash
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * What the command line loop should do next, once a typed line has been looked at.
 */
export type SlashCommandOutcome =
	/** The line was not a slash command, so it is an ordinary message for the model. */
	| { kind: 'notACommand' }
	/** The command did its work at the terminal, and the model is not involved. */
	| { kind: 'handled' }
	/** The command produced a message that should now be sent to the model. */
	| { kind: 'prompt'; text: string }
	/** The user asked to leave. */
	| { kind: 'quit' };

/**
 * The name of a slash command and whatever the user typed after it.
 */
export type ParsedSlashCommand = {
	/** The name typed after the slash, for example `greet` or `git:commit`. */
	name: string;
	/** Everything typed after the name. */
	argumentText: string;
};

/**
 * The commands paullette answers itself. A command read from `.paullette/commands` never takes one of these names.
 */
const BUILT_IN_NAMES = ['help', 'exit', 'quit', 'clear', 'agents', 'skills', 'commands', 'memory'];

/**
 * Deals with a line the user typed that starts with a slash.
 */
export class SlashCommandHandler {
	/** Everything read out of the `.paullette` folder. */
	private readonly _content: ConfigFolderContent;
	/** The working folder, the permission asker, and the tool call logger. */
	private readonly _toolContext: ToolContext;
	/** The store holding everything remembered about this project. */
	private readonly _memoryStore: MemoryStore;
	/** The conversation being held, which `/clear` starts afresh. */
	private readonly _conversationSession: ConversationSession;
	/** The model the conversation is held with, needed when `/clear` opens a new one. */
	private readonly _modelName: string;

	/**
	 * Builds the slash command handler.
	 *
	 * @param content Everything read out of the `.paullette` folder.
	 * @param toolContext The working folder, the permission asker, and the tool call logger.
	 * @param memoryStore The store holding everything remembered about this project.
	 * @param conversationSession The conversation being held.
	 * @param modelName The model the conversation is held with.
	 */
	constructor(
		content: ConfigFolderContent,
		toolContext: ToolContext,
		memoryStore: MemoryStore,
		conversationSession: ConversationSession,
		modelName: string,
	) {
		this._content = content;
		this._toolContext = toolContext;
		this._memoryStore = memoryStore;
		this._conversationSession = conversationSession;
		this._modelName = modelName;
	}

	/**
	 * Splits a typed line into the name of a slash command and its arguments.
	 *
	 * @param line The line the user typed.
	 * @returns The name and the arguments, or null when the line is not a slash command.
	 */
	static parse(line: string): ParsedSlashCommand | null {
		const trimmedLine = line.trim();
		if (trimmedLine.startsWith('/') === false) {
			return null;
		}

		const withoutSlash = trimmedLine.slice(1);
		const firstSpaceIndex = withoutSlash.search(/\s/);

		if (firstSpaceIndex === -1) {
			return {
				name: withoutSlash,
				argumentText: '',
			};
		}

		return {
			name: withoutSlash.slice(0, firstSpaceIndex),
			argumentText: withoutSlash.slice(firstSpaceIndex + 1).trim(),
		};
	}

	/**
	 * Deals with one typed line.
	 *
	 * @param line The line the user typed.
	 * @returns What the command line loop should do next.
	 */
	async handle(line: string): Promise<SlashCommandOutcome> {
		const parsed = SlashCommandHandler.parse(line);
		if (parsed === null) {
			return {
				kind: 'notACommand',
			};
		}

		if (BUILT_IN_NAMES.includes(parsed.name) === true) {
			return this._handleBuiltIn(parsed);
		}

		const commandDefinition = this._content.commandDefinitions.find((candidate) => {
			return candidate.name === parsed.name;
		});

		if (commandDefinition === undefined) {
			OutputRenderer.writeError(`There is no command called /${parsed.name}. Type /help to see the commands.`);
			return {
				kind: 'handled',
			};
		}

		const expandedText = await CommandExpander.expand(commandDefinition, parsed.argumentText, this._toolContext);
		return {
			kind: 'prompt',
			text: expandedText,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Deals with one of the commands paullette answers itself.
	 *
	 * @param parsed The name and the arguments of the command.
	 * @returns What the command line loop should do next.
	 */
	private _handleBuiltIn(parsed: ParsedSlashCommand): SlashCommandOutcome {
		if (parsed.name === 'exit' || parsed.name === 'quit') {
			return {
				kind: 'quit',
			};
		}

		if (parsed.name === 'help') {
			this._writeHelp();
			return {
				kind: 'handled',
			};
		}

		if (parsed.name === 'clear') {
			this._conversationSession.startFresh(this._modelName);
			OutputRenderer.writeNotice('Started a new conversation. The old one is still on disk.');
			return {
				kind: 'handled',
			};
		}

		if (parsed.name === 'agents') {
			OutputRenderer.writeList(
				'Subagents',
				this._content.agentDefinitions.map((definition) => `${definition.name} — ${definition.description}`),
				'None. Put one in .paullette/agents to add one.',
			);
			return {
				kind: 'handled',
			};
		}

		if (parsed.name === 'skills') {
			OutputRenderer.writeList(
				'Skills',
				this._content.skillDefinitions.map((definition) => `${definition.name} — ${definition.description}`),
				'None. Put one in .paullette/skills to add one.',
			);
			return {
				kind: 'handled',
			};
		}

		if (parsed.name === 'commands') {
			this._writeHelp();
			return {
				kind: 'handled',
			};
		}

		OutputRenderer.writeList(
			'Memory',
			this._memoryStore.listAll().map((entry) => `${entry.name} (${entry.type}) — ${entry.description}`),
			'Nothing has been remembered about this project yet.',
		);
		return {
			kind: 'handled',
		};
	}

	/**
	 * Prints the commands paullette answers itself and the commands read from the `.paullette` folder.
	 *
	 * @returns Nothing.
	 */
	private _writeHelp(): void {
		OutputRenderer.writeList(
			'Commands',
			[
				'/help — show this list',
				'/exit — save the conversation and leave',
				'/clear — start a new conversation',
				'/agents — list the subagents that were loaded',
				'/skills — list the skills that were loaded',
				'/commands — list the slash commands that were loaded, the same list as /help',
				'/memory — list everything remembered about this project',
			],
			'',
		);

		OutputRenderer.writeList(
			'Commands from .paullette/commands',
			this._content.commandDefinitions.map((definition) => {
				const hint = definition.argumentHint === undefined ? '' : ` ${definition.argumentHint}`;
				return `/${definition.name}${hint} — ${definition.description}`;
			}),
			'None. Put one in .paullette/commands to add one.',
		);
	}
}
