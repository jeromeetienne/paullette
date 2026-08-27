import Assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { SearchTools } from '../../src/tools/search_tools.ts';
import { ToolHarness } from './libs/tool_harness.ts';
import { TemporaryFolder } from './libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	search_tools_test — checks glob_files and grep_files find what is there and skip the generated folders
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('SearchTools', () => {
	/** The working folder each test uses. */
	let workingDirectoryPath = '';

	beforeEach(() => {
		workingDirectoryPath = TemporaryFolder.make();
		TemporaryFolder.writeFile(workingDirectoryPath, 'src/cli.ts', 'export const answer = 42;\n');
		TemporaryFolder.writeFile(workingDirectoryPath, 'src/tools/file_tools.ts', 'export const answer = 7;\n');
		TemporaryFolder.writeFile(workingDirectoryPath, 'notes.md', 'The answer is written down here.\n');
		TemporaryFolder.writeFile(workingDirectoryPath, 'node_modules/library/index.ts', 'export const answer = 0;\n');
		TemporaryFolder.writeFile(workingDirectoryPath, 'dist/cli.ts', 'export const answer = 1;\n');
	});

	afterEach(() => {
		TemporaryFolder.remove(workingDirectoryPath);
	});

	/**
	 * Builds the search tools against the working folder of the test.
	 *
	 * @returns The tools.
	 */
	const makeTools = () => {
		const harnessedContext = ToolHarness.makeContext(workingDirectoryPath, 'allowed');
		return SearchTools.createAll(harnessedContext.toolContext);
	};

	test('glob_files finds every file matching the pattern', async () => {
		const result = await ToolHarness.invoke(makeTools(), 'glob_files', {
			pattern: 'src/**/*.ts',
		});

		Assert.deepEqual(result.split('\n').sort(), ['src/cli.ts', 'src/tools/file_tools.ts']);
	});

	test('glob_files never looks inside node_modules or dist', async () => {
		const result = await ToolHarness.invoke(makeTools(), 'glob_files', {
			pattern: '**/*.ts',
		});

		Assert.equal(result.includes('node_modules'), false);
		Assert.equal(result.includes('dist/'), false);
	});

	test('glob_files says so plainly when nothing matches', async () => {
		const result = await ToolHarness.invoke(makeTools(), 'glob_files', {
			pattern: '**/*.py',
		});

		Assert.equal(result, 'Nothing matches **/*.py.');
	});

	test('grep_files gives back the file, the line number, and the line', async () => {
		const result = await ToolHarness.invoke(makeTools(), 'grep_files', {
			pattern: 'answer is written',
			directoryPath: '.',
		});

		Assert.ok(result.includes('./notes.md:1:The answer is written down here.'));
	});

	test('grep_files never looks inside node_modules or dist', async () => {
		const result = await ToolHarness.invoke(makeTools(), 'grep_files', {
			pattern: 'answer',
			directoryPath: '.',
		});

		Assert.equal(result.includes('node_modules'), false);
		Assert.equal(result.includes('dist/'), false);
	});

	test('grep_files searches only the folder it was given', async () => {
		const result = await ToolHarness.invoke(makeTools(), 'grep_files', {
			pattern: 'answer',
			directoryPath: 'src',
		});

		Assert.ok(result.includes('cli.ts'));
		Assert.equal(result.includes('notes.md'), false);
	});

	test('grep_files says so plainly when nothing matches', async () => {
		const result = await ToolHarness.invoke(makeTools(), 'grep_files', {
			pattern: 'a phrase that is nowhere in the folder',
			directoryPath: '.',
		});

		Assert.ok(result.startsWith('Nothing in . matches'));
	});

	test('grep_files refuses a folder above the working folder', async () => {
		const result = await ToolHarness.invoke(makeTools(), 'grep_files', {
			pattern: 'answer',
			directoryPath: '../..',
		});

		Assert.ok(result.includes('outside the working folder'));
	});
});
