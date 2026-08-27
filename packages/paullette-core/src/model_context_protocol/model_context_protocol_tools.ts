import { mcpToFunctionTool, type MCPServer } from '@openai/agents';

import { ToolPaths } from '../tools/tool_paths.ts';
import { type ToolContext } from '../tools/tool_types.ts';
import { type StartedModelContextProtocolServer } from './model_context_protocol_server_launcher.ts';
import { type ModelContextProtocolWarning } from './model_context_protocol_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ModelContextProtocolTools — turns the tools of a started server into tools of the agent
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One tool as a Model Context Protocol server describes it, taken from the server interface of the OpenAI Agents
 * software development kit so that the shape never has to be restated here and never drifts from what the
 * software development kit hands back.
 */
export type ModelContextProtocolTool = Awaited<ReturnType<MCPServer['listTools']>>[number];

/**
 * One tool of the agent built out of a tool of a Model Context Protocol server, taken from the conversion the
 * OpenAI Agents software development kit does so that the shape never has to be restated here.
 */
export type ModelContextProtocolBuiltTool = ReturnType<typeof mcpToFunctionTool>;

/**
 * What `ModelContextProtocolTools.createAll` ended up with.
 */
export type ModelContextProtocolToolsResult = {
	/** Every tool of every started server, ready to be given to the agent. */
	tools: ModelContextProtocolBuiltTool[];
	/** One warning for every server that would not say which tools it has. */
	warnings: ModelContextProtocolWarning[];
};

/**
 * Turns the tools of a started Model Context Protocol server into tools of the agent.
 */
export class ModelContextProtocolTools {
	/**
	 * Asks every started server for its tools, and turns each one into a tool of the agent.
	 *
	 * A server that will not say which tools it has is a warning, and the tools of the other servers are still
	 * returned.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @param startedServers The servers that started.
	 * @returns Every tool, and one warning for every server that would not answer.
	 */
	static async createAll(
		context: ToolContext,
		startedServers: StartedModelContextProtocolServer[],
	): Promise<ModelContextProtocolToolsResult> {
		const tools: ModelContextProtocolBuiltTool[] = [];
		const warnings: ModelContextProtocolWarning[] = [];

		for (const startedServer of startedServers) {
			let modelContextProtocolTools: ModelContextProtocolTool[];
			try {
				modelContextProtocolTools = await startedServer.server.listTools();
			} catch (caughtError) {
				const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
				warnings.push({
					serverName: startedServer.name,
					message: `The Model Context Protocol server ${startedServer.name} would not say which tools it has, so none of them is available: ${reason}`,
				});
				continue;
			}

			for (const modelContextProtocolTool of modelContextProtocolTools) {
				tools.push(
					ModelContextProtocolTools._createOne(context, startedServer, modelContextProtocolTool),
				);
			}
		}

		return {
			tools: tools,
			warnings: warnings,
		};
	}

	/**
	 * Turns the name of a server and the name of one of its tools into the single name the model sees.
	 *
	 * The name of the server goes in front so that two servers that expose the same tool name do not collide.
	 * Everything that is not a letter, a digit, or an underscore becomes an underscore, because the OpenAI
	 * Agents software development kit normalises a tool name that way whatever paullette does, and the name
	 * paullette reports has to be the name the model sees.
	 *
	 * @param serverName The name of the server.
	 * @param toolName The name the server gives the tool.
	 * @returns The name of the tool of the agent.
	 */
	static toToolName(serverName: string, toolName: string): string {
		return `${serverName}_${toolName}`.replace(/[^a-zA-Z0-9_]/g, '_');
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Turns one tool of one server into a tool of the agent, asking the user before every call.
	 *
	 * The software development kit already knows how to turn a Model Context Protocol tool into a tool of the
	 * agent, so that conversion is reused and only the calling is replaced. The replacement writes the tool call
	 * line, asks the user, and caps the result, which is exactly what a built-in tool of paullette does.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @param startedServer The server the tool belongs to.
	 * @param modelContextProtocolTool The tool as the server describes it.
	 * @returns The tool of the agent.
	 */
	private static _createOne(
		context: ToolContext,
		startedServer: StartedModelContextProtocolServer,
		modelContextProtocolTool: ModelContextProtocolTool,
	): ModelContextProtocolBuiltTool {
		const toolName = ModelContextProtocolTools.toToolName(startedServer.name, modelContextProtocolTool.name);

		const convertedTool = mcpToFunctionTool(modelContextProtocolTool, startedServer.server, false, {
			toolNameOverride: toolName,
		});

		const callServer = convertedTool.invoke;

		return {
			...convertedTool,
			invoke: async (runContext, input, details) => {
				context.logToolCall(toolName, input);

				const decision = await context.permissionAsker.ask({
					toolName: toolName,
					summary: `call the tool ${modelContextProtocolTool.name} of the Model Context Protocol server ${startedServer.name}`,
					detail: input,
				});

				if (decision === 'refused') {
					return 'The user refused to let you call that tool. Do not try again.';
				}

				try {
					const result = await callServer(runContext, input, details);
					return ToolPaths.capOutput(typeof result === 'string' ? result : JSON.stringify(result));
				} catch (caughtError) {
					const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
					return `That did not work: ${reason}`;
				}
			},
		};
	}
}
