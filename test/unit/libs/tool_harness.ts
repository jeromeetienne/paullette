import { RunContext } from '@openai/agents';

import { type BuiltTool } from '../../../src/tools/tool_registry.ts';
import { type ToolContext } from '../../../src/tools/tool_types.ts';
import { FakePermissionAsker } from './fake_permission_asker.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ToolHarness — builds a ToolContext for a test and calls one tool by name
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * A tool context built for one test, together with the two things a test looks at afterwards.
 */
export type HarnessedToolContext = {
	/** The context to hand to the tool being tested. */
	toolContext: ToolContext;
	/** The asker the context uses, holding every permission request the tool made. */
	permissionAsker: FakePermissionAsker;
	/** One entry per tool call that was logged, as the tool name and the one line summary. */
	toolCallLog: Array<{ toolName: string; summary: string }>;
};

/**
 * Builds a `ToolContext` for a test and calls one tool by name.
 *
 * A tool is called the same way the OpenAI Agents SDK calls it, through `invoke` with the arguments as JSON, so
 * that a test exercises the schema of the tool as well as its body.
 */
export class ToolHarness {
	/**
	 * Builds a tool context that writes nowhere except the folder it is given.
	 *
	 * @param workingDirectoryPath The folder the tools resolve every relative path against.
	 * @param decision The answer the permission asker gives to every request.
	 * @returns The context, the asker, and the log of the tool calls.
	 */
	static makeContext(workingDirectoryPath: string, decision: 'allowed' | 'refused'): HarnessedToolContext {
		const permissionAsker = new FakePermissionAsker(decision);
		const toolCallLog: Array<{ toolName: string; summary: string }> = [];

		return {
			toolContext: {
				workingDirectoryPath: workingDirectoryPath,
				permissionAsker: permissionAsker,
				logToolCall: (toolName: string, summary: string) => {
					toolCallLog.push({
						toolName: toolName,
						summary: summary,
					});
				},
			},
			permissionAsker: permissionAsker,
			toolCallLog: toolCallLog,
		};
	}

	/**
	 * Calls one tool out of a list by its name.
	 *
	 * @param tools The tools to choose from.
	 * @param toolName The name of the tool to call.
	 * @param toolArguments The arguments of the tool, which are turned into the JSON the SDK would send.
	 * @returns Whatever the tool gave back, as text.
	 * @throws When there is no tool of that name, or when it is not a tool that can be called.
	 */
	static async invoke(tools: BuiltTool[], toolName: string, toolArguments: Record<string, unknown>): Promise<string> {
		const builtTool = tools.find((candidate) => {
			return 'name' in candidate && candidate.name === toolName;
		});

		if (builtTool === undefined) {
			throw new Error(`there is no tool called ${toolName}`);
		}
		if ('invoke' in builtTool === false) {
			throw new Error(`the tool called ${toolName} cannot be called directly`);
		}

		const runContext = new RunContext({});
		const result = await builtTool.invoke(runContext, JSON.stringify(toolArguments));
		return String(result);
	}
}
