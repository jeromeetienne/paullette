import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { SessionStore } from '../../src/history/session_store.ts';
import { type ConversationHistoryItem } from '../../src/history/history_types.ts';
import { TemporaryFolder } from '../libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	session_store_test — checks SessionStore writes a whole conversation and reads the newest one back
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One conversation item, shaped the way the OpenAI Agents SDK hands a message back. The store writes whatever it
 * is given without looking inside, so one message is enough to check what it writes.
 *
 * @param text What the message says.
 * @returns The conversation item.
 */
const makeHistoryItem = (text: string): ConversationHistoryItem => {
	return {
		type: 'message',
		role: 'user',
		content: text,
	} as ConversationHistoryItem;
};

describe('SessionStore', () => {
	/** The folder each test writes into. */
	let temporaryFolderPath = '';
	/** The store under test, pointed at the sessions folder inside that folder. */
	let sessionStore: SessionStore;
	/** The absolute path of the sessions folder. */
	let sessionsFolderPath = '';

	beforeEach(() => {
		temporaryFolderPath = TemporaryFolder.make();
		sessionsFolderPath = Path.join(temporaryFolderPath, '.paullette', 'sessions');
		sessionStore = new SessionStore(sessionsFolderPath);
	});

	afterEach(() => {
		TemporaryFolder.remove(temporaryFolderPath);
	});

	test('starts a session without writing anything to disk', () => {
		const session = sessionStore.startSession('qwen3.5-4b');

		Assert.equal(session.modelName, 'qwen3.5-4b');
		Assert.deepEqual(session.history, []);
		Assert.equal(session.startedAt, session.updatedAt);
		Assert.equal(Fs.existsSync(sessionsFolderPath), false);
	});

	test('gives every session a different name', () => {
		const firstSession = sessionStore.startSession('a-model');
		const secondSession = sessionStore.startSession('a-model');

		Assert.notEqual(firstSession.identifier, secondSession.identifier);
	});

	test('gives a session a name that can be used as a file name', () => {
		const session = sessionStore.startSession('a-model');

		Assert.match(session.identifier, /^[A-Za-z0-9-]+$/);
	});

	test('says there is nothing to resume before anything is written', () => {
		Assert.equal(sessionStore.loadNewestSession(), null);
	});

	test('writes the whole conversation and reads it back', () => {
		const session = sessionStore.startSession('qwen3.5-4b');
		const history = [makeHistoryItem('the first question')];

		const filePath = sessionStore.save(session, history);
		Assert.equal(filePath, Path.join(sessionsFolderPath, `${session.identifier}.json`));

		const loadedSession = sessionStore.loadNewestSession();
		Assert.equal(loadedSession?.identifier, session.identifier);
		Assert.equal(loadedSession?.modelName, 'qwen3.5-4b');
		Assert.equal(loadedSession?.history.length, 1);
	});

	test('replaces the file rather than adding to it when the same session is written twice', () => {
		const session = sessionStore.startSession('a-model');

		sessionStore.save(session, [makeHistoryItem('one')]);
		sessionStore.save(session, [makeHistoryItem('one'), makeHistoryItem('two')]);

		const fileNames = Fs.readdirSync(sessionsFolderPath);
		Assert.equal(fileNames.length, 1);
		Assert.equal(sessionStore.loadNewestSession()?.history.length, 2);
	});

	test('writes a session file a person can read', () => {
		const session = sessionStore.startSession('a-model');
		const filePath = sessionStore.save(session, [makeHistoryItem('a question')]);
		const fileText = Fs.readFileSync(filePath, 'utf8');

		Assert.ok(fileText.includes('\n\t"modelName": "a-model"'));
		Assert.ok(fileText.endsWith('\n'));
	});

	test('reads back the session that was written most recently', () => {
		const olderSession = sessionStore.startSession('a-model');
		sessionStore.save(olderSession, [makeHistoryItem('the older question')]);

		const newerSession = sessionStore.startSession('a-model');
		const newerFilePath = sessionStore.save(newerSession, [makeHistoryItem('the newer question')]);

		const laterTime = new Date(Date.now() + 60000);
		Fs.utimesSync(newerFilePath, laterTime, laterTime);

		Assert.equal(sessionStore.loadNewestSession()?.identifier, newerSession.identifier);
	});

	test('says there is nothing to resume rather than throwing when the newest file is not valid JSON', () => {
		Fs.mkdirSync(sessionsFolderPath, {
			recursive: true,
		});
		Fs.writeFileSync(Path.join(sessionsFolderPath, 'broken.json'), '{ this is not JSON', 'utf8');

		Assert.equal(sessionStore.loadNewestSession(), null);
	});

	test('does not read a file that is not a session file', () => {
		Fs.mkdirSync(sessionsFolderPath, {
			recursive: true,
		});
		Fs.writeFileSync(Path.join(sessionsFolderPath, 'notes.txt'), 'not a session', 'utf8');

		Assert.equal(sessionStore.loadNewestSession(), null);
	});
});
