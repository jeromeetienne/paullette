import Assert from 'node:assert/strict';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { MemoryStore } from '../../src/memory/memory_store.ts';
import { MemoryTools } from '../../src/tools/memory_tools.ts';
import { ToolHarness } from '../libs/tool_harness.ts';
import { TemporaryFolder } from '../libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	memory_tools_test — checks the memory tools reach the store and ask before they change it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('MemoryTools', () => {
	/** The working folder each test uses. */
	let workingDirectoryPath = '';
	/** The store the tools under test read and write. */
	let memoryStore: MemoryStore;

	beforeEach(() => {
		workingDirectoryPath = TemporaryFolder.make();
		memoryStore = new MemoryStore(Path.join(workingDirectoryPath, '.paullette', 'memory'));
	});

	afterEach(() => {
		TemporaryFolder.remove(workingDirectoryPath);
	});

	/**
	 * Builds the memory tools against the store of the test.
	 *
	 * @param decision The answer the permission asker gives to every request.
	 * @returns The tools and the harnessed context they were built with.
	 */
	const makeTools = (decision: 'allowed' | 'refused') => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, decision);
		return {
			tools: MemoryTools.createAll(harnessedContext.toolContext, memoryStore),
			harnessedContext: harnessedContext,
		};
	};

	test('builds the four memory tools', () => {
		const { tools } = makeTools('allowed');

		Assert.deepEqual(
			tools.map((builtTool) => builtTool.name).sort(),
			['memory_delete', 'memory_list', 'memory_read', 'memory_write'],
		);
	});

	test('memory_write asks first, and writes the fact once it is allowed', async () => {
		const { tools, harnessedContext } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'memory_write', {
			name: 'default-endpoint',
			description: 'Where the model is served from',
			type: 'project',
			body: 'The endpoint is LM Studio on port 1234.',
		});

		Assert.ok(result.startsWith('Remembered that,'));
		Assert.equal(memoryStore.read('default-endpoint')?.body, 'The endpoint is LM Studio on port 1234.');
		Assert.equal(harnessedContext.permissionAsker.requests.length, 1);
		Assert.equal(harnessedContext.permissionAsker.requests[0]?.toolName, 'memory_write');
	});

	test('memory_write remembers nothing when the user refuses', async () => {
		const { tools } = makeTools('refused');

		const result = await ToolHarness.invoke(tools, 'memory_write', {
			name: 'default-endpoint',
			description: 'Where the model is served from',
			type: 'project',
			body: 'The endpoint is LM Studio on port 1234.',
		});

		Assert.ok(result.includes('refused'));
		Assert.equal(memoryStore.read('default-endpoint'), null);
	});

	test('memory_write refuses a kind of fact that is not one of the four', async () => {
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'memory_write', {
			name: 'default-endpoint',
			description: 'Where the model is served from',
			type: 'something-else',
			body: 'The endpoint is LM Studio on port 1234.',
		});

		Assert.ok(result.includes('Invalid JSON input for tool'));
		Assert.equal(memoryStore.read('default-endpoint'), null);
	});

	test('memory_list says nothing is remembered before anything is written', async () => {
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'memory_list', {});

		Assert.equal(result, 'Nothing has been remembered about this project yet.');
	});

	test('memory_list gives the name, the kind, and the line of every fact', async () => {
		memoryStore.write('default-endpoint', 'Where the model is served from', 'project', 'A fact.');
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'memory_list', {});

		Assert.equal(result, '- default-endpoint (project): Where the model is served from');
	});

	test('memory_read gives back the fact itself', async () => {
		memoryStore.write('default-endpoint', 'One line', 'project', 'The endpoint is LM Studio on port 1234.');
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'memory_read', {
			name: 'default-endpoint',
		});

		Assert.equal(result, 'The endpoint is LM Studio on port 1234.');
	});

	test('memory_read says so plainly when nothing is remembered under that name', async () => {
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'memory_read', {
			name: 'never-written',
		});

		Assert.equal(result, 'Nothing is remembered under the name never-written.');
	});

	test('memory_delete asks first, and forgets the fact once it is allowed', async () => {
		memoryStore.write('default-endpoint', 'One line', 'project', 'A fact.');
		const { tools, harnessedContext } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'memory_delete', {
			name: 'default-endpoint',
		});

		Assert.ok(result.includes('Forgot default-endpoint'));
		Assert.equal(memoryStore.read('default-endpoint'), null);
		Assert.equal(harnessedContext.permissionAsker.requests[0]?.detail, 'A fact.');
	});

	test('memory_delete forgets nothing when the user refuses', async () => {
		memoryStore.write('default-endpoint', 'One line', 'project', 'A fact.');
		const { tools } = makeTools('refused');

		const result = await ToolHarness.invoke(tools, 'memory_delete', {
			name: 'default-endpoint',
		});

		Assert.ok(result.includes('refused'));
		Assert.notEqual(memoryStore.read('default-endpoint'), null);
	});

	test('memory_delete says so plainly when nothing is remembered under that name', async () => {
		const { tools } = makeTools('allowed');

		const result = await ToolHarness.invoke(tools, 'memory_delete', {
			name: 'never-written',
		});

		Assert.equal(result, 'Nothing is remembered under the name never-written.');
	});
});
