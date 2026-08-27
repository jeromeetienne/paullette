import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { InputHistoryStore } from '../../src/history/input_history_store.ts';
import { TemporaryFolder } from './libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	input_history_store_test — checks InputHistoryStore remembers the lines the user typed
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * How many typed lines the store keeps. This restates the cap inside `InputHistoryStore`, because the store does
 * not export it and a test that reads the cap from the code under test would pass whatever the cap became.
 */
const MAXIMUM_LINE_COUNT = 1000;

describe('InputHistoryStore', () => {
	/** The folder each test writes into. */
	let temporaryFolderPath = '';
	/** The store under test. */
	let inputHistoryStore: InputHistoryStore;
	/** The absolute path of the file the typed lines are kept in. */
	let filePath = '';

	beforeEach(() => {
		temporaryFolderPath = TemporaryFolder.make();
		filePath = Path.join(temporaryFolderPath, '.code-agent', 'input_history.txt');
		inputHistoryStore = new InputHistoryStore(filePath);
	});

	afterEach(() => {
		TemporaryFolder.remove(temporaryFolderPath);
	});

	test('gives an empty list before anything was typed', () => {
		Assert.deepEqual(inputHistoryStore.load(), []);
	});

	test('makes the folder above the file when it is absent', () => {
		inputHistoryStore.append('what does this project do');

		Assert.equal(Fs.existsSync(filePath), true);
	});

	test('gives the lines back newest first, which is what the up arrow key expects', () => {
		inputHistoryStore.append('the oldest question');
		inputHistoryStore.append('the middle question');
		inputHistoryStore.append('the newest question');

		Assert.deepEqual(inputHistoryStore.load(), [
			'the newest question',
			'the middle question',
			'the oldest question',
		]);
	});

	test('does not add the same line twice in a row', () => {
		inputHistoryStore.append('the same question');
		inputHistoryStore.append('the same question');

		Assert.deepEqual(inputHistoryStore.load(), ['the same question']);
	});

	test('adds a line again when another line came between', () => {
		inputHistoryStore.append('the first question');
		inputHistoryStore.append('another question');
		inputHistoryStore.append('the first question');

		Assert.deepEqual(inputHistoryStore.load(), [
			'the first question',
			'another question',
			'the first question',
		]);
	});

	test('ignores a line that is empty or only spaces', () => {
		inputHistoryStore.append('   ');
		inputHistoryStore.append('');

		Assert.equal(Fs.existsSync(filePath), false);
		Assert.deepEqual(inputHistoryStore.load(), []);
	});

	test('drops the spaces at both ends of a line', () => {
		inputHistoryStore.append('  a question  ');

		Assert.deepEqual(inputHistoryStore.load(), ['a question']);
	});

	test('drops the oldest lines once there are too many', () => {
		const writtenLines: string[] = [];
		for (let lineNumber = 1; lineNumber <= MAXIMUM_LINE_COUNT + 5; lineNumber += 1) {
			writtenLines.push(`question number ${lineNumber}`);
		}
		Fs.mkdirSync(Path.dirname(filePath), {
			recursive: true,
		});
		Fs.writeFileSync(filePath, `${writtenLines.join('\n')}\n`, 'utf8');

		inputHistoryStore.append('one more question');

		const loadedLines = inputHistoryStore.load();
		Assert.equal(loadedLines.length, MAXIMUM_LINE_COUNT);
		Assert.equal(loadedLines[0], 'one more question');
		Assert.equal(loadedLines.includes('question number 1'), false);
	});

	test('gives an empty list rather than throwing when the file cannot be read', () => {
		Fs.mkdirSync(filePath, {
			recursive: true,
		});

		Assert.deepEqual(inputHistoryStore.load(), []);
	});
});
