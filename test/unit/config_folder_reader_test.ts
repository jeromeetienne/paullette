import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { ConfigFolderReader } from '../../src/config_folder/config_folder_reader.ts';
import { TemporaryFolder } from './libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	config_folder_reader_test — checks ConfigFolderReader reads a whole .paullette folder at once
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('ConfigFolderReader.read', () => {
	/** The folder each test works inside, standing in for a project. */
	let projectFolderPath = '';

	beforeEach(() => {
		projectFolderPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(projectFolderPath);
	});

	test('makes the folder and reads nothing out of it when the project is fresh', () => {
		const content = ConfigFolderReader.read(projectFolderPath);

		Assert.equal(Fs.existsSync(Path.join(projectFolderPath, '.paullette')), true);
		Assert.equal(content.instructionDocument, null);
		Assert.deepEqual(content.agentDefinitions, []);
		Assert.deepEqual(content.commandDefinitions, []);
		Assert.deepEqual(content.skillDefinitions, []);
	});

	test('reads the instruction document, the subagents, the commands, and the skills together', () => {
		TemporaryFolder.writeFile(projectFolderPath, '.paullette/CLAUDE.md', 'Always write tests.\n');
		TemporaryFolder.writeFile(projectFolderPath, '.paullette/agents/reviewer.md', 'Review the diff.\n');
		TemporaryFolder.writeFile(projectFolderPath, '.paullette/commands/review.md', 'Review $ARGUMENTS.\n');
		TemporaryFolder.writeFile(projectFolderPath, '.paullette/skills/notes/SKILL.md', 'Write the notes.\n');

		const content = ConfigFolderReader.read(projectFolderPath);

		Assert.equal(content.instructionDocument?.text, 'Always write tests.');
		Assert.deepEqual(
			content.agentDefinitions.map((definition) => definition.name),
			['reviewer'],
		);
		Assert.deepEqual(
			content.commandDefinitions.map((definition) => definition.name),
			['review'],
		);
		Assert.deepEqual(
			content.skillDefinitions.map((definition) => definition.name),
			['notes'],
		);
	});

	test('reads out of the project root rather than the folder paullette was started in', () => {
		Fs.mkdirSync(Path.join(projectFolderPath, '.git'));
		TemporaryFolder.writeFile(projectFolderPath, '.paullette/CLAUDE.md', 'Always write tests.\n');
		const deepFolderPath = Path.join(projectFolderPath, 'src', 'tools');
		Fs.mkdirSync(deepFolderPath, {
			recursive: true,
		});

		const content = ConfigFolderReader.read(deepFolderPath);

		Assert.equal(content.paths.projectRootPath, projectFolderPath);
		Assert.equal(content.instructionDocument?.text, 'Always write tests.');
	});
});
