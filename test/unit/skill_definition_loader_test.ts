import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { SkillDefinitionLoader } from '../../src/config_folder/skill_definition_loader.ts';
import { TemporaryFolder } from './libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	skill_definition_loader_test — checks SkillDefinitionLoader reads .code-agent/skills
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('SkillDefinitionLoader.loadAll', () => {
	/** The folder each test works inside, standing in for the `.code-agent` folder. */
	let configFolderPath = '';

	beforeEach(() => {
		configFolderPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(configFolderPath);
	});

	test('gives an empty list when there is no skills folder', () => {
		Assert.deepEqual(SkillDefinitionLoader.loadAll(configFolderPath), []);
	});

	test('reads the name, the description, the instructions, and the folder of one skill', () => {
		TemporaryFolder.writeFile(
			configFolderPath,
			'skills/release-notes/SKILL.md',
			'---\nname: release-notes\ndescription: Writes the release notes\n---\n\nList every change.\n',
		);

		const definitions = SkillDefinitionLoader.loadAll(configFolderPath);

		Assert.equal(definitions.length, 1);
		Assert.equal(definitions[0]?.name, 'release-notes');
		Assert.equal(definitions[0]?.description, 'Writes the release notes');
		Assert.equal(definitions[0]?.instructions, 'List every change.');
		Assert.equal(definitions[0]?.folderPath, Path.join(configFolderPath, 'skills', 'release-notes'));
	});

	test('falls back to the name of the folder when the frontmatter gives no name', () => {
		TemporaryFolder.writeFile(configFolderPath, 'skills/release-notes/SKILL.md', 'List every change.\n');

		const definitions = SkillDefinitionLoader.loadAll(configFolderPath);

		Assert.equal(definitions[0]?.name, 'release-notes');
		Assert.equal(definitions[0]?.description, 'The release-notes skill.');
	});

	test('leaves out a folder that holds no SKILL.md', () => {
		Fs.mkdirSync(Path.join(configFolderPath, 'skills', 'empty-skill'), {
			recursive: true,
		});

		Assert.deepEqual(SkillDefinitionLoader.loadAll(configFolderPath), []);
	});

	test('leaves out a skill whose SKILL.md has an empty body', () => {
		TemporaryFolder.writeFile(configFolderPath, 'skills/hollow/SKILL.md', '---\nname: hollow\n---\n');

		Assert.deepEqual(SkillDefinitionLoader.loadAll(configFolderPath), []);
	});

	test('leaves out a file sitting loose in the skills folder', () => {
		TemporaryFolder.writeFile(configFolderPath, 'skills/SKILL.md', 'Not inside a folder of its own.\n');

		Assert.deepEqual(SkillDefinitionLoader.loadAll(configFolderPath), []);
	});

	test('reads every skill in the folder', () => {
		TemporaryFolder.writeFile(configFolderPath, 'skills/second/SKILL.md', 'The second skill.\n');
		TemporaryFolder.writeFile(configFolderPath, 'skills/first/SKILL.md', 'The first skill.\n');

		Assert.deepEqual(
			SkillDefinitionLoader.loadAll(configFolderPath).map((definition) => definition.name),
			['first', 'second'],
		);
	});
});
