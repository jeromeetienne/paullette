import { Agent } from '@openai/agents';

import { type AgentDefinition } from '../config_folder/config_folder_types.ts';
import { ToolRegistry, type BuiltTool } from './tool_registry.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SubagentTools — turns every subagent in .paullette/agents into a callable tool
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Everything needed to turn the subagent definitions into tools.
 */
export type SubagentToolsRequest = {
	/** Every subagent read out of `.paullette/agents`. */
	agentDefinitions: AgentDefinition[];
	/** The identifier of the model every subagent runs on. */
	modelName: string;
	/** Every ordinary tool, from which each subagent is given the ones its frontmatter asked for. */
	allTools: BuiltTool[];
};

/**
 * Turns every subagent in `.paullette/agents` into a tool the main agent can call.
 */
export class SubagentTools {
	/**
	 * Builds one tool per subagent definition.
	 *
	 * The `model` field of a subagent is read and then ignored, because paullette runs one configured model. That
	 * is a deliberate choice rather than an oversight: a `.paullette` folder copied from a Claude Code project
	 * names Anthropic models that the configured endpoint does not serve.
	 *
	 * @param request The subagent definitions, the model, and the tools to choose from.
	 * @returns One tool per subagent.
	 */
	static createAll(request: SubagentToolsRequest): BuiltTool[] {
		return request.agentDefinitions.map((agentDefinition) => {
			const subagent = new Agent({
				name: agentDefinition.name,
				instructions: agentDefinition.systemPrompt,
				model: request.modelName,
				tools: ToolRegistry.filterByName(request.allTools, agentDefinition.toolNames),
			});

			return subagent.asTool({
				toolName: SubagentTools.toToolName(agentDefinition.name),
				toolDescription: agentDefinition.description,
			});
		});
	}

	/**
	 * Turns the name of a subagent into the name its tool will carry.
	 *
	 * Everything that is not a letter, a digit, or an underscore becomes an underscore, a hyphen included. That
	 * is not a free choice: the OpenAI Agents SDK normalises a tool name the same way, so a subagent called
	 * `secret-keeper` is offered to the model as `secret_keeper` whatever this method does. Doing the same thing
	 * here means the name paullette reports and the name the model sees are the one name.
	 *
	 * @param agentName The name of the subagent.
	 * @returns The tool name.
	 */
	static toToolName(agentName: string): string {
		return agentName.replace(/[^a-zA-Z0-9_]/g, '_');
	}
}
