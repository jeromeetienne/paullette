import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { MemoryStore } from '../../src/memory/memory_store.ts';
import { TemporaryFolder } from '../libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	memory_store_test — checks MemoryStore keeps the memory files and MEMORY.md in step
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('MemoryStore.toFileName', () => {
	test('turns a name into lower case with hyphens', () => {
		Assert.equal(MemoryStore.toFileName('The Default Endpoint'), 'the-default-endpoint');
	});

	test('drops the punctuation at both ends', () => {
		Assert.equal(MemoryStore.toFileName('  ...notes!!  '), 'notes');
	});

	test('collapses a run of characters that are not letters or digits into one hyphen', () => {
		Assert.equal(MemoryStore.toFileName('a / b :: c'), 'a-b-c');
	});

	test('calls a name with nothing usable in it untitled', () => {
		Assert.equal(MemoryStore.toFileName('!!!'), 'untitled');
		Assert.equal(MemoryStore.toFileName(''), 'untitled');
	});
});

describe('MemoryStore on disk', () => {
	/** The folder each test writes into. */
	let temporaryFolderPath = '';
	/** The store under test, pointed at the memory folder inside that folder. */
	let memoryStore: MemoryStore;
	/** The absolute path of the memory folder. */
	let memoryFolderPath = '';

	beforeEach(() => {
		temporaryFolderPath = TemporaryFolder.make();
		memoryFolderPath = Path.join(temporaryFolderPath, '.paullette', 'memory');
		memoryStore = new MemoryStore(memoryFolderPath);
	});

	afterEach(() => {
		TemporaryFolder.remove(temporaryFolderPath);
	});

	test('says nothing is remembered before anything is written', () => {
		Assert.equal(memoryStore.readIndex(), null);
		Assert.deepEqual(memoryStore.listAll(), []);
		Assert.equal(memoryStore.read('anything'), null);
	});

	test('writes a fact and reads it back', () => {
		const filePath = memoryStore.write(
			'The Default Endpoint',
			'Where the model is served from',
			'project',
			'The endpoint is LM Studio on port 1234.',
		);

		Assert.equal(filePath, Path.join(memoryFolderPath, 'the-default-endpoint.md'));

		const entry = memoryStore.read('The Default Endpoint');
		Assert.notEqual(entry, null);
		Assert.equal(entry?.name, 'the-default-endpoint');
		Assert.equal(entry?.description, 'Where the model is served from');
		Assert.equal(entry?.type, 'project');
		Assert.equal(entry?.body, 'The endpoint is LM Studio on port 1234.');
	});

	test('reads a fact back under any spelling of its name', () => {
		memoryStore.write('the default endpoint', 'One line', 'project', 'A fact.');

		Assert.notEqual(memoryStore.read('The Default Endpoint'), null);
		Assert.notEqual(memoryStore.read('the-default-endpoint'), null);
	});

	test('puts one line in the index for every fact', () => {
		memoryStore.write('second', 'The second fact', 'project', 'Two.');
		memoryStore.write('first', 'The first fact', 'user', 'One.');

		const indexText = memoryStore.readIndex();
		Assert.notEqual(indexText, null);
		Assert.ok(indexText?.startsWith('# Memory'));
		Assert.ok(indexText?.includes('- [first](first.md) — The first fact'));
		Assert.ok(indexText?.includes('- [second](second.md) — The second fact'));
	});

	test('replaces a fact of the same name rather than adding a second one', () => {
		memoryStore.write('endpoint', 'The old line', 'project', 'The old fact.');
		memoryStore.write('endpoint', 'The new line', 'project', 'The new fact.');

		const entries = memoryStore.listAll();
		Assert.equal(entries.length, 1);
		Assert.equal(entries[0]?.description, 'The new line');
		Assert.equal(entries[0]?.body, 'The new fact.');
		Assert.ok(memoryStore.readIndex()?.includes('The old line') === false);
	});

	test('lists the facts in the order of their names', () => {
		memoryStore.write('charlie', 'Third', 'project', 'Three.');
		memoryStore.write('alpha', 'First', 'project', 'One.');
		memoryStore.write('bravo', 'Second', 'project', 'Two.');

		Assert.deepEqual(
			memoryStore.listAll().map((entry) => entry.name),
			['alpha', 'bravo', 'charlie'],
		);
	});

	test('forgets a fact and takes it out of the index', () => {
		memoryStore.write('endpoint', 'One line', 'project', 'A fact.');

		Assert.equal(memoryStore.delete('endpoint'), true);
		Assert.equal(memoryStore.read('endpoint'), null);
		Assert.deepEqual(memoryStore.listAll(), []);
		Assert.ok(memoryStore.readIndex()?.includes('endpoint') === false);
	});

	test('says so rather than throwing when asked to forget a fact that is not there', () => {
		Assert.equal(memoryStore.delete('never-written'), false);
	});

	test('keeps a description that holds a colon or a line break readable when it is read back', () => {
		memoryStore.write('tricky', 'A description: with a colon\nand a second line', 'reference', 'A fact.');

		Assert.equal(memoryStore.read('tricky')?.description, 'A description: with a colon\nand a second line');
	});

	test('leaves out a file whose body is empty', () => {
		Fs.mkdirSync(memoryFolderPath, {
			recursive: true,
		});
		Fs.writeFileSync(Path.join(memoryFolderPath, 'hollow.md'), '---\nname: hollow\n---\n', 'utf8');

		Assert.deepEqual(memoryStore.listAll(), []);
	});

	test('falls back to the file name and to the project type when the frontmatter says neither', () => {
		Fs.mkdirSync(memoryFolderPath, {
			recursive: true,
		});
		Fs.writeFileSync(Path.join(memoryFolderPath, 'bare.md'), 'Just a fact with no frontmatter.\n', 'utf8');

		const entries = memoryStore.listAll();
		Assert.equal(entries.length, 1);
		Assert.equal(entries[0]?.name, 'bare');
		Assert.equal(entries[0]?.description, 'bare');
		Assert.equal(entries[0]?.type, 'project');
	});

	test('does not read the index file as if it were a fact', () => {
		memoryStore.write('endpoint', 'One line', 'project', 'A fact.');

		Assert.deepEqual(
			memoryStore.listAll().map((entry) => entry.name),
			['endpoint'],
		);
	});
});
