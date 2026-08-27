import Assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { RunContext } from '@openai/agents';

import { ModelContextProtocolTools } from '../../src/model_context_protocol/model_context_protocol_tools.ts';
import { type PermissionDecision, type PermissionRequest, type ToolContext } from '../../src/tools/tool_types.ts';
import { FakeModelContextProtocolServer } from '../libs/fake_model_context_protocol_server.ts';
import { FakePermissionAsker } from '../libs/fake_permission_asker.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	model_context_protocol_tools_test — checks a server tool becomes an agent tool that asks first
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Everything one test needs to call a tool.
 */
type Fixture = {
	/** The working folder, the permission asker, and the tool call logger. */
	toolContext: ToolContext;
	/** The permission asker, kept so that a test can read what was asked. */
	permissionAsker: FakePermissionAsker;
	/** Every line the tool call logger was given, as the name of the tool and the summary joined by a space. */
	loggedLines: string[];
};

/**
 * Takes the one tool a test expects, and fails the test when there is not exactly one.
 *
 * @param tools Every tool that was built.
 * @returns The one tool.
 * @throws When there is not exactly one tool.
 */
const onlyTool = <ToolType>(tools: ToolType[]): ToolType => {
	Assert.equal(tools.length, 1);
	const firstTool = tools[0];
	if (firstTool === undefined) {
		throw new Error('no tool was built');
	}
	return firstTool;
};

/**
 * Builds the tool context one test calls a tool with.
 *
 * @param decision The answer the permission asker gives to every request.
 * @returns The tool context, the permission asker, and the logged lines.
 */
const makeFixture = (decision: PermissionDecision): Fixture => {
	const permissionAsker = new FakePermissionAsker(decision);
	const loggedLines: string[] = [];

	return {
		toolContext: {
			workingDirectoryPath: '/nowhere',
			permissionAsker: permissionAsker,
			logToolCall: (toolName, summary) => {
				loggedLines.push(`${toolName} ${summary}`);
			},
		},
		permissionAsker: permissionAsker,
		loggedLines: loggedLines,
	};
};

describe('ModelContextProtocolTools.toToolName', () => {
	test('puts the name of the server in front of the name of the tool', () => {
		Assert.equal(ModelContextProtocolTools.toToolName('now', 'get_current_date'), 'now_get_current_date');
	});

	test('turns everything that is not a letter, a digit, or an underscore into an underscore', () => {
		Assert.equal(
			ModelContextProtocolTools.toToolName('my-server', 'read.file'),
			'my_server_read_file',
		);
	});
});

describe('ModelContextProtocolTools.createAll', () => {
	test('gives every tool of every server a name that starts with the name of its server', async () => {
		const fixture = makeFixture('allowed');
		const firstServer = new FakeModelContextProtocolServer('now', ['get_current_date'], 'the answer');
		const secondServer = new FakeModelContextProtocolServer('other', ['get_current_date'], 'the answer');

		const result = await ModelContextProtocolTools.createAll(fixture.toolContext, [
			{
				name: 'now',
				server: firstServer,
			},
			{
				name: 'other',
				server: secondServer,
			},
		]);

		Assert.deepEqual(result.warnings, []);
		Assert.deepEqual(
			result.tools.map((tool) => tool.name),
			['now_get_current_date', 'other_get_current_date'],
		);
	});

	test('asks the user before the call, and gives the answer of the server back to the model', async () => {
		const fixture = makeFixture('allowed');
		const server = new FakeModelContextProtocolServer('now', ['get_current_date'], 'the twelfth of never');

		const result = await ModelContextProtocolTools.createAll(fixture.toolContext, [
			{
				name: 'now',
				server: server,
			},
		]);
		const answer = await onlyTool(result.tools).invoke(new RunContext(), '{"question":"which day"}');

		Assert.equal(fixture.permissionAsker.requests.length, 1);
		const request: PermissionRequest | undefined = fixture.permissionAsker.requests[0];
		Assert.equal(request?.toolName, 'now_get_current_date');
		Assert.match(String(request?.summary), /get_current_date/);
		Assert.match(String(request?.summary), /now/);
		Assert.equal(request?.detail, '{"question":"which day"}');

		Assert.deepEqual(fixture.loggedLines, ['now_get_current_date {"question":"which day"}']);
		Assert.deepEqual(server.calls, [
			{
				toolName: 'get_current_date',
				args: {
					question: 'which day',
				},
			},
		]);
		Assert.match(String(answer), /the twelfth of never/);
	});

	test('never reaches the server when the user refuses', async () => {
		const fixture = makeFixture('refused');
		const server = new FakeModelContextProtocolServer('now', ['get_current_date'], 'the twelfth of never');

		const result = await ModelContextProtocolTools.createAll(fixture.toolContext, [
			{
				name: 'now',
				server: server,
			},
		]);
		const answer = await onlyTool(result.tools).invoke(new RunContext(), '{}');

		Assert.deepEqual(server.calls, []);
		Assert.equal(answer, 'The user refused to let you call that tool. Do not try again.');
	});

	test('warns about a server that will not say which tools it has, and keeps the tools of the others', async () => {
		const fixture = makeFixture('allowed');
		const brokenServer = new FakeModelContextProtocolServer('broken', [], '', 'it hung up');
		const workingServer = new FakeModelContextProtocolServer('now', ['get_current_date'], 'the answer');

		const result = await ModelContextProtocolTools.createAll(fixture.toolContext, [
			{
				name: 'broken',
				server: brokenServer,
			},
			{
				name: 'now',
				server: workingServer,
			},
		]);

		Assert.deepEqual(
			result.tools.map((tool) => tool.name),
			['now_get_current_date'],
		);
		Assert.equal(result.warnings.length, 1);
		Assert.equal(result.warnings[0]?.serverName, 'broken');
		Assert.match(String(result.warnings[0]?.message), /it hung up/);
	});
});
