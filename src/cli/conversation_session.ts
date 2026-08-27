import Path from 'node:path';

import { type Agent, run } from '@openai/agents';
import { user } from '@openai/agents';

import { type ConversationHistoryItem, type StoredSession } from '../history/history_types.ts';
import { SessionStore } from '../history/session_store.ts';

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
	 * @param sessionsFolderPath The absolute path of the `.doublure/sessions` folder.
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
	 * How many items the conversation holds so far.
	 */
	get itemCount(): number {
		return this._storedSession.history.length;
	}

	/**
	 * Runs one turn: sends everything said so far along with the new message, streams the answer out, and writes
	 * the conversation to disk.
	 *
	 * The conversation is written before the model is called as well as after it answers, so that stopping
	 * doublure part way through a turn cannot lose what was already said.
	 *
	 * @param agent The agent to run.
	 * @param promptText The message of the user.
	 * @param maximumTurnCount The largest number of model turns this request may take.
	 * @param onTextChunk Called with each piece of the answer as it arrives.
	 * @returns Nothing.
	 */
	async runTurn(
		agent: Agent,
		promptText: string,
		maximumTurnCount: number,
		onTextChunk: (textChunk: string) => void,
	): Promise<void> {
		const inputItems: ConversationHistoryItem[] = [...this._storedSession.history, user(promptText)];
		this._save(inputItems);

		const result = await run(agent, inputItems, {
			stream: true,
			maxTurns: maximumTurnCount,
		});

		for await (const textChunk of result.toTextStream()) {
			onTextChunk(textChunk);
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
