import Fs from 'node:fs';
import Path from 'node:path';

import {
	type ConversationHistoryItem,
	type StoredSession,
	type StoredSessionSummary,
} from './history_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SessionStore — saves the conversation to .paullette/sessions and reads it back
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Saves the conversation to `.paullette/sessions` and reads it back.
 *
 * The whole conversation is rewritten at the end of every turn rather than appended to, so that a session file
 * is always a complete and readable conversation. A run that is stopped part way through loses at most the turn
 * that was in flight.
 */
export class SessionStore {
	/** The absolute path of the `.paullette/sessions` folder. */
	private readonly _sessionsFolderPath: string;

	/**
	 * Builds the session store.
	 *
	 * @param sessionsFolderPath The absolute path of the `.paullette/sessions` folder.
	 */
	constructor(sessionsFolderPath: string) {
		this._sessionsFolderPath = sessionsFolderPath;
	}

	/**
	 * Starts a new, empty session.
	 *
	 * Nothing is written to disk until the first turn is saved, so starting paullette and quitting without asking
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
	 * Lists every session on disk, newest first, without reading what was said in any of them.
	 *
	 * A file that cannot be read or cannot be understood is passed over rather than thrown on, because a folder
	 * a person can open and edit by hand is a folder that will one day hold a file paullette did not write.
	 *
	 * @returns One summary per session, newest first.
	 */
	listSessions(): StoredSessionSummary[] {
		if (Fs.existsSync(this._sessionsFolderPath) === false) {
			return [];
		}

		const summaries: StoredSessionSummary[] = [];

		for (const fileName of Fs.readdirSync(this._sessionsFolderPath)) {
			if (fileName.endsWith('.json') === false) {
				continue;
			}

			try {
				const text = Fs.readFileSync(Path.join(this._sessionsFolderPath, fileName), 'utf8');
				const session = JSON.parse(text) as StoredSession;
				summaries.push({
					identifier: session.identifier,
					startedAt: session.startedAt,
					updatedAt: session.updatedAt,
					modelName: session.modelName,
					itemCount: Array.isArray(session.history) === true ? session.history.length : 0,
				});
			} catch {
				continue;
			}
		}

		return summaries.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
	}

	/**
	 * Reads back one session by its identifier.
	 *
	 * The identifier is checked against the shape `startSession` gives, and anything else is refused without a
	 * file being opened. The identifier reaches this method from a web address, so a name holding a dot or a
	 * separator would otherwise read a file outside the sessions folder.
	 *
	 * @param identifier The name of the session, which is also the name of its file without the extension.
	 * @returns The session, or null when there is no such session or the identifier is not one paullette makes.
	 */
	loadSession(identifier: string): StoredSession | null {
		if (/^[A-Za-z0-9-]+$/.test(identifier) === false) {
			return null;
		}

		const filePath = Path.join(this._sessionsFolderPath, `${identifier}.json`);
		if (Fs.existsSync(filePath) === false) {
			return null;
		}

		try {
			return JSON.parse(Fs.readFileSync(filePath, 'utf8')) as StoredSession;
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
