import { Agent } from '@openai/agents';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AgentBuilder — builds the agent paullette runs
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Everything the agent needs to be built.
 */
export type AgentBuildRequest = {
	/** The identifier of the model to use on the configured endpoint. */
	modelName: string;
	/** The whole system prompt, already assembled by `SystemPromptBuilder`. */
	systemPrompt: string;
	/** The tools the agent may call. This is empty until the tools are built. */
	tools: Agent['tools'];
};

/**
 * Builds the agent paullette runs.
 */
export class AgentBuilder {
	/**
	 * Builds the agent.
	 *
	 * The model is named here rather than being resolved to a model object, because `ModelProvider.configure`
	 * has already pointed the OpenAI Agents SDK at the endpoint that serves it.
	 *
	 * @param request The model, the system prompt, and the tools.
	 * @returns The agent, ready to be given to `run`.
	 */
	static build(request: AgentBuildRequest): Agent {
		return new Agent({
			name: 'paullette',
			instructions: request.systemPrompt,
			model: request.modelName,
			tools: request.tools,
		});
	}
}
