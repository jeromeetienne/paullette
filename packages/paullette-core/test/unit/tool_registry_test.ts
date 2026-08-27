import Assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ToolRegistry } from '../../src/tools/tool_registry.ts';
import { ToolHarness } from '../libs/tool_harness.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	tool_registry_test — checks ToolRegistry assembles the tool list and narrows it for a subagent
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Reads the name out of every tool in a list.
 *
 * @param tools The tools to read the names of.
 * @returns The names, in the order the tools were in.
 */
const readNames = (tools: ReturnType<typeof ToolRegistry.createAll>): string[] => {
	return tools.map((builtTool) => ('name' in builtTool ? builtTool.name : ''));
};

describe('ToolRegistry.createAll', () => {
	test('builds every file tool, every search tool, and the shell tool', () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');

		Assert.deepEqual(readNames(ToolRegistry.createAll(toolContext)).sort(), [
			'edit_file',
			'glob_files',
			'grep_files',
			'list_directory',
			'read_file',
			'run_shell_command',
			'write_file',
		]);
	});
});

describe('ToolRegistry.filterByName', () => {
	test('gives back every tool when the subagent asked for nothing in particular', () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');
		const tools = ToolRegistry.createAll(toolContext);

		Assert.equal(ToolRegistry.filterByName(tools, undefined).length, tools.length);
	});

	test('keeps only the tools the subagent asked for', () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');
		const tools = ToolRegistry.createAll(toolContext);

		const keptTools = ToolRegistry.filterByName(tools, ['read_file', 'glob_files']);

		Assert.deepEqual(readNames(keptTools).sort(), ['glob_files', 'read_file']);
	});

	test('matches a name whatever its capitalisation', () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');
		const tools = ToolRegistry.createAll(toolContext);

		Assert.deepEqual(readNames(ToolRegistry.filterByName(tools, ['Read_File'])), ['read_file']);
	});

	test('passes over a name paullette does not have rather than refusing the whole subagent', () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');
		const tools = ToolRegistry.createAll(toolContext);

		Assert.deepEqual(readNames(ToolRegistry.filterByName(tools, ['read_file', 'WebFetch'])), ['read_file']);
	});

	test('gives back nothing when the subagent asked for an empty list', () => {
		const { toolContext } = ToolHarness.makeContext('/projects/paullette', 'allowed');
		const tools = ToolRegistry.createAll(toolContext);

		Assert.deepEqual(ToolRegistry.filterByName(tools, []), []);
	});
});
