import { type Agent } from '@openai/agents';

import { FileTools } from './file_tools.ts';
import { SearchTools } from './search_tools.ts';
import { ShellTools } from './shell_tools.ts';
import { type ToolContext } from './tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ToolRegistry — assembles the tool list and narrows it for a subagent
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One tool as the OpenAI Agents SDK sees it, taken from the agent itself so that the shape never has to be
 * restated here and never drifts from what the SDK accepts.
 */
export type BuiltTool = Agent['tools'][number];

/**
 * Assembles the tool list and narrows it for a subagent.
 */
export class ToolRegistry {
	/**
	 * Builds every tool the main agent may call.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @returns Every tool.
	 */
	static createAll(context: ToolContext): BuiltTool[] {
		return [...FileTools.createAll(context), ...SearchTools.createAll(context), ...ShellTools.createAll(context)];
	}

	/**
	 * Narrows a tool list down to the names a subagent asked for in its frontmatter.
	 *
	 * A name that matches nothing is ignored rather than refused, because a `.doublure` folder copied from a
	 * Claude Code project names tools that doublure does not have, and losing the whole subagent over one
	 * unknown name would be worse than giving it a shorter list.
	 *
	 * @param tools The tools to choose from.
	 * @param allowedToolNames The names the subagent asked for, or undefined when it asked for everything.
	 * @returns The tools the subagent may call.
	 */
	static filterByName(tools: BuiltTool[], allowedToolNames: string[] | undefined): BuiltTool[] {
		if (allowedToolNames === undefined) {
			return tools;
		}

		const wantedNames = new Set(allowedToolNames.map((toolName) => toolName.toLowerCase()));
		return tools.filter((builtTool) => {
			const toolName = 'name' in builtTool ? builtTool.name : '';
			return wantedNames.has(toolName.toLowerCase()) === true;
		});
	}
}
