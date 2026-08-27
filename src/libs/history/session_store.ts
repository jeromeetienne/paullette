import Fs from 'node:fs';
import Path from 'node:path';

import { type ConversationHistoryItem, type StoredSession } from './history_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SessionStore — saves the conversation to .doublure/sessions and reads it back
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Saves the conversation to `.doublure/sessions` and reads it back.
 *
 * The whole conversation is rewritten at the end of every turn rather than appended to, so that a session file
 * is always a complete and readable conversation. A run that is stopped part way through loses at most the turn
 * that was in flight.
 */
export class SessionStore {
	/** The absolute path of the `.doublure/sessions` folder. */
	private readonly _sessionsFolderPath: string;

	/**
	 * Builds the session store.
	 *
	 * @param sessionsFolderPath The absolute path of the `.doublure/sessions` folder.
	 */
	constructor(sessionsFolderPath: string) {
		this._sessionsFolderPath = sessionsFolderPath;
	}

	/**
	 * Starts a new, empty session.
	 *
	 * Nothing is written to disk until the first turn is saved, so starting doublure and quitting without asking
	 * anything leaves no file behind.
	 *
	 * @param modelName The model the conversation will be held with.
	 * @returns The new session.
	 */
	startSession(modelName: string): StoredSession {
		const now = new Date();
		const timestampPart = now.toISOString().replace(/[:.]/g, '-');
		const randomPart = Math.random().toString(36).slice(2, 8);

		return {
			identifier: `${timestampPart}-${randomPart}`,
			startedAt: now.toISOString(),
			updatedAt: now.toISOString(),
			modelName: modelName,
			history: [],
		};
	}

	/**
	 * Reads back the session that was written most recently.
	 *
	 * @returns The newest session, or null when there is none.
	 */
	loadNewestSession(): StoredSession | null {
		if (Fs.existsSync(this._sessionsFolderPath) === false) {
			return null;
		}

		const fileNames = Fs.readdirSync(this._sessionsFolderPath).filter((fileName) => {
			return fileName.endsWith('.json') === true;
		});

		if (fileNames.length === 0) {
			return null;
		}

		const newestFileName = fileNames.sort((first, second) => {
			const firstTime = Fs.statSync(Path.join(this._sessionsFolderPath, first)).mtimeMs;
			const secondTime = Fs.statSync(Path.join(this._sessionsFolderPath, second)).mtimeMs;
			return secondTime - firstTime;
		})[0] as string;

		try {
			const text = Fs.readFileSync(Path.join(this._sessionsFolderPath, newestFileName), 'utf8');
			return JSON.parse(text) as StoredSession;
		} catch {
			return null;
		}
	}

	/**
	 * Writes the whole conversation, replacing whatever the file held before.
	 *
	 * @param session The session to write.
	 * @param history Everything said so far.
	 * @returns The absolute path of the file that was written.
	 */
	save(session: StoredSession, history: ConversationHistoryItem[]): string {
		Fs.mkdirSync(this._sessionsFolderPath, {
			recursive: true,
		});

		const updatedSession: StoredSession = {
			...session,
			updatedAt: new Date().toISOString(),
			history: history,
		};

		const filePath = Path.join(this._sessionsFolderPath, `${session.identifier}.json`);
		Fs.writeFileSync(filePath, `${JSON.stringify(updatedSession, null, '\t')}\n`, 'utf8');
		return filePath;
	}
}
