import Assert from 'node:assert/strict';
import Path from 'node:path';
import { describe, test } from 'node:test';

import { ToolPaths } from '../../src/tools/tool_paths.ts';
import { MAXIMUM_TOOL_OUTPUT_CHARACTER_COUNT } from '../../src/tools/tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	tool_paths_test — checks ToolPaths keeps a tool inside the working folder
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * A working folder that does not need to exist, because every method under test works on the text of a path.
 */
const WORKING_DIRECTORY_PATH = Path.resolve('/tmp/paullette-working-folder');

describe('ToolPaths.resolveInside', () => {
	test('turns a relative path into an absolute path inside the working folder', () => {
		const resolvedPath = ToolPaths.resolveInside(WORKING_DIRECTORY_PATH, 'src/cli.ts');

		Assert.equal(resolvedPath, Path.join(WORKING_DIRECTORY_PATH, 'src', 'cli.ts'));
	});

	test('accepts an absolute path that is already inside the working folder', () => {
		const givenPath = Path.join(WORKING_DIRECTORY_PATH, 'notes.md');
		const resolvedPath = ToolPaths.resolveInside(WORKING_DIRECTORY_PATH, givenPath);

		Assert.equal(resolvedPath, givenPath);
	});

	test('accepts a path that climbs out and back in again', () => {
		const resolvedPath = ToolPaths.resolveInside(WORKING_DIRECTORY_PATH, 'src/../notes.md');

		Assert.equal(resolvedPath, Path.join(WORKING_DIRECTORY_PATH, 'notes.md'));
	});

	test('refuses a path that climbs above the working folder', () => {
		Assert.throws(() => {
			ToolPaths.resolveInside(WORKING_DIRECTORY_PATH, '../../etc/passwd');
		}, /outside the working folder/);
	});

	test('refuses an absolute path somewhere else on the disk', () => {
		Assert.throws(() => {
			ToolPaths.resolveInside(WORKING_DIRECTORY_PATH, '/etc/passwd');
		}, /outside the working folder/);
	});

	test('refuses a sibling folder whose name starts with the name of the working folder', () => {
		Assert.throws(() => {
			ToolPaths.resolveInside(WORKING_DIRECTORY_PATH, `${WORKING_DIRECTORY_PATH}-other/notes.md`);
		}, /outside the working folder/);
	});
});

describe('ToolPaths.describe', () => {
	test('shortens an absolute path to the path a person reads', () => {
		const absolutePath = Path.join(WORKING_DIRECTORY_PATH, 'src', 'cli.ts');

		Assert.equal(ToolPaths.describe(WORKING_DIRECTORY_PATH, absolutePath), Path.join('src', 'cli.ts'));
	});

	test('calls the working folder itself a single dot', () => {
		Assert.equal(ToolPaths.describe(WORKING_DIRECTORY_PATH, WORKING_DIRECTORY_PATH), '.');
	});
});

describe('ToolPaths.capOutput', () => {
	test('leaves a short result exactly as it was', () => {
		Assert.equal(ToolPaths.capOutput('a short result'), 'a short result');
	});

	test('leaves a result of exactly the largest size exactly as it was', () => {
		const text = 'x'.repeat(MAXIMUM_TOOL_OUTPUT_CHARACTER_COUNT);

		Assert.equal(ToolPaths.capOutput(text), text);
	});

	test('cuts a long result and says how many characters were dropped', () => {
		const droppedCount = 25;
		const text = 'x'.repeat(MAXIMUM_TOOL_OUTPUT_CHARACTER_COUNT + droppedCount);
		const cappedText = ToolPaths.capOutput(text);

		Assert.ok(cappedText.startsWith('x'.repeat(MAXIMUM_TOOL_OUTPUT_CHARACTER_COUNT)));
		Assert.ok(cappedText.includes(`${droppedCount} more characters were not shown`));
	});
});
