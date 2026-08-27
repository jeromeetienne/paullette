import { type ToolContext } from '../tools/tool_types.ts';
import { ModelContextProtocolConfigReader } from './model_context_protocol_config_reader.ts';
import {
	ModelContextProtocolServerLauncher,
	type StartedModelContextProtocolServer,
} from './model_context_protocol_server_launcher.ts';
import { ModelContextProtocolTools, type ModelContextProtocolBuiltTool } from './model_context_protocol_tools.ts';
import { type ModelContextProtocolWarning } from './model_context_protocol_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ModelContextProtocolSession — the running Model Context Protocol servers of one run of paullette
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Where the Model Context Protocol servers are declared, and what their tools are given when they are called.
 */
export type ModelContextProtocolSessionStartRequest = {
	/** The absolute path of the folder paullette treats as the root of the project. */
	projectRootPath: string;
	/** The absolute path of the `.paullette` folder of the project. */
	configFolderPath: string;
	/** The folder a standard input and output server runs in when it names no folder. */
	workingDirectoryPath: string;
	/** The working folder, the permission asker, and the tool call logger given to every tool. */
	toolContext: ToolContext;
	/** The absolute path of the `.paullette` folder of the user, which defaults to the one in the home folder. */
	userConfigFolderPath?: string;
};

/**
 * The running Model Context Protocol servers of one run of paullette, and the tools they give the agent.
 */
export class ModelContextProtocolSession {
	/** The servers that started and answered. */
	readonly startedServers: StartedModelContextProtocolServer[];

	/** Every tool of every started server, ready to be given to the agent. */
	readonly tools: ModelContextProtocolBuiltTool[];

	/** Everything that did not work, in the order it was found. */
	readonly warnings: ModelContextProtocolWarning[];

	/**
	 * Builds the session. Use `ModelContextProtocolSession.start` rather than this, because starting a server is
	 * asynchronous and a constructor cannot wait.
	 *
	 * @param startedServers The servers that started.
	 * @param tools The tools of those servers.
	 * @param warnings Everything that did not work.
	 */
	constructor(
		startedServers: StartedModelContextProtocolServer[],
		tools: ModelContextProtocolBuiltTool[],
		warnings: ModelContextProtocolWarning[],
	) {
		this.startedServers = startedServers;
		this.tools = tools;
		this.warnings = warnings;
	}

	/**
	 * Reads the declared servers, starts them, and builds their tools.
	 *
	 * Nothing here is thrown out of: a server that is missing, a file that is broken, and a server that will not
	 * answer all become warnings, and paullette starts either way.
	 *
	 * @param request Where the servers are declared, and what their tools are given.
	 * @returns The session, with the tools of every server that started.
	 */
	static async start(request: ModelContextProtocolSessionStartRequest): Promise<ModelContextProtocolSession> {
		const configReadResult = ModelContextProtocolConfigReader.readAll({
			projectRootPath: request.projectRootPath,
			configFolderPath: request.configFolderPath,
			userConfigFolderPath: request.userConfigFolderPath,
		});

		const startResult = await ModelContextProtocolServerLauncher.startAll(
			configReadResult.serverDefinitions,
			request.workingDirectoryPath,
		);

		const toolsResult = await ModelContextProtocolTools.createAll(
			request.toolContext,
			startResult.startedServers,
		);

		return new ModelContextProtocolSession(startResult.startedServers, toolsResult.tools, [
			...configReadResult.warnings,
			...startResult.warnings,
			...toolsResult.warnings,
		]);
	}

	/**
	 * The names of the servers that started, in the order they were declared.
	 *
	 * @returns The names.
	 */
	get serverNames(): string[] {
		return this.startedServers.map((startedServer) => startedServer.name);
	}

	/**
	 * Stops every started server.
	 *
	 * @returns Nothing.
	 */
	async close(): Promise<void> {
		await ModelContextProtocolServerLauncher.stopAll(this.startedServers);
	}
}
