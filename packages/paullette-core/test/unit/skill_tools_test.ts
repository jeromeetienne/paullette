import Assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { type SkillDefinition } from '../../src/config_folder/config_folder_types.ts';
import { SkillTools } from '../../src/tools/skill_tools.ts';
import { ToolHarness } from '../libs/tool_harness.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	skill_tools_test — checks load_skill gives back the instructions of a skill and nothing else
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One skill to load in a test.
 *
 * @param name The name of the skill.
 * @returns The skill definition.
 */
const makeSkill = (name: string): SkillDefinition => {
	return {
		name: name,
		description: `The ${name} skill.`,
		instructions: `The instructions of ${name}.`,
		folderPath: `/projects/paullette/.paullette/skills/${name}`,
	};
};

describe('SkillTools.createAll', () => {
	test('builds no tool at all when the project has no skills', () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');

		Assert.deepEqual(SkillTools.createAll(toolContext, []), []);
	});

	test('names every skill in the description of the tool, so that the model can choose one', () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');

		const tools = SkillTools.createAll(toolContext, [makeSkill('release-notes'), makeSkill('triage')]);

		Assert.equal(tools.length, 1);
		Assert.ok(tools[0]?.description.includes('release-notes, triage'));
	});
});

describe('load_skill', () => {
	test('gives back the instructions of the skill and where its files are', async () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');
		const tools = SkillTools.createAll(toolContext, [makeSkill('release-notes')]);

		const result = await ToolHarness.invoke(tools, 'load_skill', {
			skillName: 'release-notes',
		});

		Assert.ok(result.includes('The instructions of release-notes.'));
		Assert.ok(result.includes('/projects/paullette/.paullette/skills/release-notes'));
	});

	test('finds the skill whatever the capitalisation and the spaces around the name', async () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');
		const tools = SkillTools.createAll(toolContext, [makeSkill('release-notes')]);

		const result = await ToolHarness.invoke(tools, 'load_skill', {
			skillName: '  Release-Notes  ',
		});

		Assert.ok(result.includes('The instructions of release-notes.'));
	});

	test('names the skills there are when it is asked for one that does not exist', async () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');
		const tools = SkillTools.createAll(toolContext, [makeSkill('release-notes')]);

		const result = await ToolHarness.invoke(tools, 'load_skill', {
			skillName: 'never-written',
		});

		Assert.ok(result.includes('There is no skill called never-written'));
		Assert.ok(result.includes('release-notes'));
	});

	test('logs the name of the skill it was asked for', async () => {
		const harnessedContext = ToolHarness.makeContext('/projects/paullette', 'allowed');
		const tools = SkillTools.createAll(harnessedContext.toolContext, [makeSkill('release-notes')]);

		await ToolHarness.invoke(tools, 'load_skill', {
			skillName: 'release-notes',
		});

		Assert.deepEqual(harnessedContext.toolCallLog, [
			{
				toolName: 'load_skill',
				summary: 'release-notes',
			},
		]);
	});
});
