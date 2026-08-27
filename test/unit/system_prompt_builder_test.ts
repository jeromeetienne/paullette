import Assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { type SkillDefinition } from '../../src/config_folder/config_folder_types.ts';
import { SystemPromptBuilder, type SystemPromptParts } from '../../src/agent/system_prompt_builder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	system_prompt_builder_test — checks SystemPromptBuilder puts in only the sections that have content
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The parts of a project that has no `.paullette` content at all.
 *
 * @param overrides The parts to change.
 * @returns The parts to build a system prompt from.
 */
const makeParts = (overrides: Partial<SystemPromptParts> = {}): SystemPromptParts => {
	return {
		workingDirectoryPath: '/projects/paullette',
		instructionDocument: null,
		skillDefinitions: [],
		memoryIndexText: null,
		isMemoryAvailable: false,
		...overrides,
	};
};

/**
 * One skill, holding only the two fields that reach the system prompt.
 *
 * @param name The name of the skill.
 * @param description The sentence that says when to load it.
 * @returns The skill definition.
 */
const makeSkill = (name: string, description: string): SkillDefinition => {
	return {
		name: name,
		description: description,
		instructions: 'The instructions of the skill, which must never reach the system prompt.',
		folderPath: `/projects/paullette/.paullette/skills/${name}`,
	};
};

describe('SystemPromptBuilder.build', () => {
	test('always names the working folder', () => {
		const prompt = SystemPromptBuilder.build(makeParts());

		Assert.ok(prompt.includes('/projects/paullette'));
	});

	test('leaves out every optional section when there is nothing to put in it', () => {
		const prompt = SystemPromptBuilder.build(makeParts());

		Assert.equal(prompt.includes('# Project instructions'), false);
		Assert.equal(prompt.includes('# Skills'), false);
		Assert.equal(prompt.includes('# Memory'), false);
	});

	test('puts in the instruction document and says where it came from', () => {
		const prompt = SystemPromptBuilder.build(
			makeParts({
				instructionDocument: {
					filePath: '/projects/paullette/.paullette/CLAUDE.md',
					text: 'Always write tests.',
				},
			}),
		);

		Assert.ok(prompt.includes('# Project instructions'));
		Assert.ok(prompt.includes('/projects/paullette/.paullette/CLAUDE.md'));
		Assert.ok(prompt.includes('Always write tests.'));
	});

	test('puts in the name and the description of every skill, and never its instructions', () => {
		const prompt = SystemPromptBuilder.build(
			makeParts({
				skillDefinitions: [
					makeSkill('release-notes', 'Writes the release notes'),
					makeSkill('triage', 'Sorts the open issues'),
				],
			}),
		);

		Assert.ok(prompt.includes('- release-notes: Writes the release notes'));
		Assert.ok(prompt.includes('- triage: Sorts the open issues'));
		Assert.ok(prompt.includes('load_skill'));
		Assert.equal(prompt.includes('The instructions of the skill'), false);
	});

	test('tells the agent it can remember things once the memory tools are there', () => {
		const prompt = SystemPromptBuilder.build(
			makeParts({
				isMemoryAvailable: true,
			}),
		);

		Assert.ok(prompt.includes('# Memory'));
		Assert.ok(prompt.includes('memory_write'));
	});

	test('puts in the index of the memory when there is one', () => {
		const prompt = SystemPromptBuilder.build(
			makeParts({
				isMemoryAvailable: true,
				memoryIndexText: '# Memory\n\n- [endpoint](endpoint.md) — Where the model is served from',
			}),
		);

		Assert.ok(prompt.includes('- [endpoint](endpoint.md) — Where the model is served from'));
		Assert.ok(prompt.includes('memory_read'));
	});

	test('leaves out the index of the memory when the memory tools are absent', () => {
		const prompt = SystemPromptBuilder.build(
			makeParts({
				isMemoryAvailable: false,
				memoryIndexText: '# Memory\n\n- [endpoint](endpoint.md) — Where the model is served from',
			}),
		);

		Assert.equal(prompt.includes('endpoint.md'), false);
	});

	test('leaves out an index of the memory that holds nothing but spaces', () => {
		const prompt = SystemPromptBuilder.build(
			makeParts({
				isMemoryAvailable: true,
				memoryIndexText: '   \n\n',
			}),
		);

		Assert.ok(prompt.includes('# Memory'));
		Assert.equal(prompt.includes('memory_read'), false);
	});
});
