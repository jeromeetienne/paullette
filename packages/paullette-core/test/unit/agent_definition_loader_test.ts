import Assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { AgentDefinitionLoader } from '../../src/config_folder/agent_definition_loader.ts';
import { TemporaryFolder } from '../libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	agent_definition_loader_test — checks AgentDefinitionLoader reads .paullette/agents
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('AgentDefinitionLoader.loadAll', () => {
	/** The folder each test works inside, standing in for the `.paullette` folder. */
	let configFolderPath = '';

	beforeEach(() => {
		configFolderPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(configFolderPath);
	});

	test('gives an empty list when there is no agents folder', () => {
		Assert.deepEqual(AgentDefinitionLoader.loadAll(configFolderPath), []);
	});

	test('reads the name, the description, and the system prompt out of one file', () => {
		TemporaryFolder.writeFile(
			configFolderPath,
			'agents/reviewer.md',
			'---\nname: reviewer\ndescription: Reviews the code\n---\n\nRead the diff and say what is wrong.\n',
		);

		const definitions = AgentDefinitionLoader.loadAll(configFolderPath);

		Assert.equal(definitions.length, 1);
		Assert.equal(definitions[0]?.name, 'reviewer');
		Assert.equal(definitions[0]?.description, 'Reviews the code');
		Assert.equal(definitions[0]?.systemPrompt, 'Read the diff and say what is wrong.');
		Assert.equal(definitions[0]?.toolNames, undefined);
	});

	test('falls back to the file name when the frontmatter gives no name', () => {
		TemporaryFolder.writeFile(configFolderPath, 'agents/reviewer.md', 'Read the diff.\n');

		const definitions = AgentDefinitionLoader.loadAll(configFolderPath);

		Assert.equal(definitions[0]?.name, 'reviewer');
		Assert.equal(definitions[0]?.description, 'The reviewer subagent.');
	});

	test('reads the tool names written as a list', () => {
		TemporaryFolder.writeFile(
			configFolderPath,
			'agents/reader.md',
			'---\nname: reader\ntools:\n  - read_file\n  - glob_files\n---\n\nRead files.\n',
		);

		Assert.deepEqual(AgentDefinitionLoader.loadAll(configFolderPath)[0]?.toolNames, ['read_file', 'glob_files']);
	});

	test('reads the tool names written as one line separated by commas', () => {
		TemporaryFolder.writeFile(
			configFolderPath,
			'agents/reader.md',
			'---\nname: reader\ntools: read_file, glob_files\n---\n\nRead files.\n',
		);

		Assert.deepEqual(AgentDefinitionLoader.loadAll(configFolderPath)[0]?.toolNames, ['read_file', 'glob_files']);
	});

	test('reads a file whose frontmatter cannot be understood, rather than stopping', () => {
		TemporaryFolder.writeFile(configFolderPath, 'agents/broken.md', '---\nname: [unclosed\n---\n\nStill useful.\n');
		TemporaryFolder.writeFile(configFolderPath, 'agents/sound.md', '---\nname: sound\n---\n\nA sound subagent.\n');

		const names = AgentDefinitionLoader.loadAll(configFolderPath).map((definition) => definition.name);

		Assert.deepEqual(names.sort(), ['broken', 'sound']);
	});

	test('leaves out a file whose body is empty', () => {
		TemporaryFolder.writeFile(configFolderPath, 'agents/hollow.md', '---\nname: hollow\n---\n');

		Assert.deepEqual(AgentDefinitionLoader.loadAll(configFolderPath), []);
	});

	test('leaves out a file that is not a Markdown file', () => {
		TemporaryFolder.writeFile(configFolderPath, 'agents/notes.txt', 'Not a subagent.');

		Assert.deepEqual(AgentDefinitionLoader.loadAll(configFolderPath), []);
	});

	test('keeps one subagent when two files claim the same name', () => {
		TemporaryFolder.writeFile(configFolderPath, 'agents/first.md', '---\nname: twin\n---\n\nThe first.\n');
		TemporaryFolder.writeFile(configFolderPath, 'agents/second.md', '---\nname: twin\n---\n\nThe second.\n');

		const definitions = AgentDefinitionLoader.loadAll(configFolderPath);

		Assert.equal(definitions.length, 1);
		Assert.equal(definitions[0]?.systemPrompt, 'The second.');
	});
});
