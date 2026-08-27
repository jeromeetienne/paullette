import Path from 'node:path';

import { type Agent, run } from '@openai/agents';
import { user } from '@openai/agents';

import { type ConversationHistoryItem, type StoredSession } from '../history/history_types.ts';
import { SessionStore } from '../history/session_store.ts';
import { type ConversationTurnListener } from './conversation_turn_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ConversationSession — holds the conversation and writes it to disk each turn
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Holds the conversation in memory, hands it back to the model on the next turn, and writes it to disk.
 */
export class ConversationSession {
	/** The store the conversation is written to. */
	private readonly _sessionStore: SessionStore;
	/** The folder the session files live in, kept so that the session file path can be named to the user. */
	private readonly _sessionsFolderPath: string;
	/** The conversation being held. */
	private _storedSession: StoredSession;

	/**
	 * Builds the conversation session.
	 *
	 * @param sessionStore The store the conversation is written to.
	 * @param sessionsFolderPath The absolute path of the `.paullette/sessions` folder.
	 * @param storedSession The conversation to start from, either newly started or read back from disk.
	 */
	constructor(sessionStore: SessionStore, sessionsFolderPath: string, storedSession: StoredSession) {
		this._sessionStore = sessionStore;
		this._sessionsFolderPath = sessionsFolderPath;
		this._storedSession = storedSession;
	}

	/**
	 * The absolute path of the file this conversation is written to.
	 */
	get sessionFilePath(): string {
		return Path.join(this._sessionsFolderPath, `${this._storedSession.identifier}.json`);
	}

	/**
	 * The identifier of the conversation being held, which is the name of its file without the extension.
	 */
	get sessionIdentifier(): string {
		return this._storedSession.identifier;
	}

	/**
	 * How many items the conversation holds so far.
	 */
	get itemCount(): number {
		return this._storedSession.history.length;
	}

	/**
	 * Everything said so far, as the OpenAI Agents SDK hands it back.
	 */
	get history(): ConversationHistoryItem[] {
		return this._storedSession.history;
	}

	/**
	 * Runs one turn: sends everything said so far along with the new message, tells the listener about each
	 * thing that happens while the turn runs, and writes the conversation to disk.
	 *
	 * The conversation is written before the model is called as well as after it answers, so that stopping
	 * paullette part way through a turn cannot lose what was already said.
	 *
	 * The run is read as a stream of events rather than as a stream of text, because a front end that draws a
	 * page has to say that a tool was called and not only what the model wrote. The text read out of the events
	 * is the whole answer and nothing is lost; that was proved live before this was written, and the raw output
	 * is in the plan on issue 9.
	 *
	 * @param agent The agent to run.
	 * @param promptText The message of the user.
	 * @param maximumTurnCount The largest number of model turns this request may take.
	 * @param onEvent Called with each thing that happens while the turn runs.
	 * @returns Nothing.
	 */
	async runTurn(
		agent: Agent,
		promptText: string,
		maximumTurnCount: number,
		onEvent: ConversationTurnListener,
	): Promise<void> {
		const inputItems: ConversationHistoryItem[] = [...this._storedSession.history, user(promptText)];
		this._save(inputItems);

		const result = await run(agent, inputItems, {
			stream: true,
			maxTurns: maximumTurnCount,
		});

		for await (const streamEvent of result) {
			if (streamEvent.type === 'raw_model_stream_event' && streamEvent.data.type === 'output_text_delta') {
				onEvent({
					kind: 'text',
					delta: streamEvent.data.delta,
				});
				continue;
			}

			if (streamEvent.type !== 'run_item_stream_event') {
				continue;
			}

			if (streamEvent.name === 'tool_called') {
				onEvent({
					kind: 'toolCalled',
					toolName: ConversationSession._readToolName(streamEvent.item),
				});
				continue;
			}

			if (streamEvent.name === 'tool_output') {
				onEvent({
					kind: 'toolOutput',
					toolName: ConversationSession._readToolName(streamEvent.item),
				});
			}
		}
		await result.completed;

		this._save(result.history);
	}

	/**
	 * Closes this conversation and opens an empty one, so that what was said before is neither sent to the model
	 * again nor lost from disk.
	 *
	 * @param modelName The model the new conversation will be held with.
	 * @returns Nothing.
	 */
	startFresh(modelName: string): void {
		this._storedSession = this._sessionStore.startSession(modelName);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads the name of the tool out of one item of a run.
	 *
	 * An item that names no tool gives `unknown` rather than throwing, because the shape of an item is decided
	 * by the OpenAI Agents SDK and by the endpoint, and a front end losing a whole turn over one unnamed tool
	 * call would be worse than a line that says `unknown`.
	 *
	 * @param item The item the OpenAI Agents SDK gave, which carries a raw item of its own.
	 * @returns The name of the tool, or `unknown`.
	 */
	private static _readToolName(item: unknown): string {
		if (typeof item !== 'object' || item === null || 'rawItem' in item === false) {
			return 'unknown';
		}

		const rawItem = (item as { rawItem: unknown }).rawItem;
		if (typeof rawItem !== 'object' || rawItem === null || 'name' in rawItem === false) {
			return 'unknown';
		}

		const name = (rawItem as { name: unknown }).name;
		return typeof name === 'string' ? name : 'unknown';
	}

	/**
	 * Writes the conversation to disk and keeps it in memory.
	 *
	 * @param history Everything said so far.
	 * @returns Nothing.
	 */
	private _save(history: ConversationHistoryItem[]): void {
		this._storedSession = {
			...this._storedSession,
			history: history,
		};
		this._sessionStore.save(this._storedSession, history);
	}
}
