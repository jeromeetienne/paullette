import Assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { CommandDefinitionLoader } from '../../src/config_folder/command_definition_loader.ts';
import { TemporaryFolder } from '../libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	command_definition_loader_test — checks CommandDefinitionLoader reads .paullette/commands
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('CommandDefinitionLoader.loadAll', () => {
	/** The folder each test works inside, standing in for the `.paullette` folder. */
	let configFolderPath = '';

	beforeEach(() => {
		configFolderPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(configFolderPath);
	});

	test('gives an empty list when there is no commands folder', () => {
		Assert.deepEqual(CommandDefinitionLoader.loadAll(configFolderPath), []);
	});

	test('reads the name, the description, and the prompt template out of one file', () => {
		TemporaryFolder.writeFile(
			configFolderPath,
			'commands/review.md',
			'---\ndescription: Reviews a file\nargument-hint: <file path>\n---\n\nReview $ARGUMENTS.\n',
		);

		const definitions = CommandDefinitionLoader.loadAll(configFolderPath);

		Assert.equal(definitions.length, 1);
		Assert.equal(definitions[0]?.name, 'review');
		Assert.equal(definitions[0]?.description, 'Reviews a file');
		Assert.equal(definitions[0]?.argumentHint, '<file path>');
		Assert.equal(definitions[0]?.promptTemplate, 'Review $ARGUMENTS.');
	});

	test('names a command in a subfolder with a colon between the parts', () => {
		TemporaryFolder.writeFile(configFolderPath, 'commands/git/commit.md', 'Write a commit message.\n');

		Assert.equal(CommandDefinitionLoader.loadAll(configFolderPath)[0]?.name, 'git:commit');
	});

	test('reads a command nested more than one folder down', () => {
		TemporaryFolder.writeFile(configFolderPath, 'commands/git/hooks/install.md', 'Install the hooks.\n');

		Assert.equal(CommandDefinitionLoader.loadAll(configFolderPath)[0]?.name, 'git:hooks:install');
	});

	test('falls back to a description built from the name', () => {
		TemporaryFolder.writeFile(configFolderPath, 'commands/review.md', 'Review the code.\n');

		Assert.equal(CommandDefinitionLoader.loadAll(configFolderPath)[0]?.description, 'The review command.');
	});

	test('leaves out a file whose body is empty', () => {
		TemporaryFolder.writeFile(configFolderPath, 'commands/hollow.md', '---\ndescription: Nothing\n---\n');

		Assert.deepEqual(CommandDefinitionLoader.loadAll(configFolderPath), []);
	});

	test('leaves out a file that is not a Markdown file', () => {
		TemporaryFolder.writeFile(configFolderPath, 'commands/notes.txt', 'Not a command.');

		Assert.deepEqual(CommandDefinitionLoader.loadAll(configFolderPath), []);
	});

	test('reads every command in the folder', () => {
		TemporaryFolder.writeFile(configFolderPath, 'commands/review.md', 'Review.\n');
		TemporaryFolder.writeFile(configFolderPath, 'commands/explain.md', 'Explain.\n');
		TemporaryFolder.writeFile(configFolderPath, 'commands/git/commit.md', 'Commit.\n');

		const names = CommandDefinitionLoader.loadAll(configFolderPath).map((definition) => definition.name);

		Assert.deepEqual(names.sort(), ['explain', 'git:commit', 'review']);
	});
});
