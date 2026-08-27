import Assert from 'node:assert/strict';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { InstructionLoader } from '../../src/config_folder/instruction_loader.ts';
import { TemporaryFolder } from '../libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	instruction_loader_test — checks InstructionLoader finds the instruction document
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('InstructionLoader.load', () => {
	/** The folder each test works inside, standing in for the `.paullette` folder. */
	let configFolderPath = '';

	beforeEach(() => {
		configFolderPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(configFolderPath);
	});

	test('gives nothing when there is no instruction document', () => {
		Assert.equal(InstructionLoader.load(configFolderPath), null);
	});

	test('reads CLAUDE.md', () => {
		TemporaryFolder.writeFile(configFolderPath, 'CLAUDE.md', '\nAlways write tests.\n');

		const instructionDocument = InstructionLoader.load(configFolderPath);

		Assert.equal(instructionDocument?.text, 'Always write tests.');
		Assert.equal(instructionDocument?.filePath, Path.join(configFolderPath, 'CLAUDE.md'));
	});

	test('reads PAULLETTE.md when there is no CLAUDE.md', () => {
		TemporaryFolder.writeFile(configFolderPath, 'PAULLETTE.md', 'Always write tests.\n');

		Assert.equal(InstructionLoader.load(configFolderPath)?.filePath, Path.join(configFolderPath, 'PAULLETTE.md'));
	});

	test('prefers CLAUDE.md when both files are there', () => {
		TemporaryFolder.writeFile(configFolderPath, 'CLAUDE.md', 'From CLAUDE.md.');
		TemporaryFolder.writeFile(configFolderPath, 'PAULLETTE.md', 'From PAULLETTE.md.');

		Assert.equal(InstructionLoader.load(configFolderPath)?.text, 'From CLAUDE.md.');
	});

	test('passes over an empty CLAUDE.md and reads PAULLETTE.md instead', () => {
		TemporaryFolder.writeFile(configFolderPath, 'CLAUDE.md', '   \n\n');
		TemporaryFolder.writeFile(configFolderPath, 'PAULLETTE.md', 'From PAULLETTE.md.');

		Assert.equal(InstructionLoader.load(configFolderPath)?.text, 'From PAULLETTE.md.');
	});

	test('gives nothing when the only instruction document is empty', () => {
		TemporaryFolder.writeFile(configFolderPath, 'CLAUDE.md', '\n\n   \n');

		Assert.equal(InstructionLoader.load(configFolderPath), null);
	});
});
