import { MCPServerSSE, MCPServerStdio, MCPServerStreamableHttp, type MCPServer } from '@openai/agents';

import {
	type ModelContextProtocolServerDefinition,
	type ModelContextProtocolWarning,
} from './model_context_protocol_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ModelContextProtocolServerLauncher — starts and stops the declared servers
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The logger a server of the OpenAI Agents software development kit accepts, taken from the constructor of that
 * server so that the shape never has to be restated here.
 */
type ModelContextProtocolLogger = NonNullable<ConstructorParameters<typeof MCPServerStreamableHttp>[0]['logger']>;

/**
 * How long one server may take to start before paullette gives up on it and carries on with the others. Without
 * this, one server that never answers keeps paullette from ever reaching the prompt.
 */
export const SERVER_START_TIMEOUT_MILLISECONDS = 20000;

/**
 * A server that started, kept next to the name it was declared under.
 */
export type StartedModelContextProtocolServer = {
	/** The name of the server, which is also what the name of every one of its tools starts with. */
	name: string;
	/** The connected server of the OpenAI Agents software development kit. */
	server: MCPServer;
};

/**
 * What `ModelContextProtocolServerLauncher.startAll` ended up with.
 */
export type ModelContextProtocolStartResult = {
	/** Every server that started and answered. */
	startedServers: StartedModelContextProtocolServer[];
	/** One warning for every server that did not start. */
	warnings: ModelContextProtocolWarning[];
};

/**
 * Starts and stops the declared Model Context Protocol servers.
 */
export class ModelContextProtocolServerLauncher {
	/**
	 * Starts every declared server.
	 *
	 * A server that fails to start is a warning and nothing more: it is left out of the list, and every other
	 * server carries on. Losing the whole session over one server that is not installed would be worse than
	 * running with the servers that do work.
	 *
	 * @param serverDefinitions Every server that was declared.
	 * @param workingDirectoryPath The folder a standard input and output server runs in when it names no folder.
	 * @returns The servers that started, and one warning for every server that did not.
	 */
	static async startAll(
		serverDefinitions: ModelContextProtocolServerDefinition[],
		workingDirectoryPath: string,
	): Promise<ModelContextProtocolStartResult> {
		const startedServers: StartedModelContextProtocolServer[] = [];
		const warnings: ModelContextProtocolWarning[] = [];

		for (const serverDefinition of serverDefinitions) {
			try {
				const server = ModelContextProtocolServerLauncher._build(serverDefinition, workingDirectoryPath);
				await ModelContextProtocolServerLauncher._connectWithTimeout(server);
				startedServers.push({
					name: serverDefinition.name,
					server: server,
				});
			} catch (caughtError) {
				const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
				warnings.push({
					serverName: serverDefinition.name,
					message: `The Model Context Protocol server ${serverDefinition.name} declared in ${serverDefinition.filePath} did not start, so its tools are not available: ${reason}`,
				});
			}
		}

		return {
			startedServers: startedServers,
			warnings: warnings,
		};
	}

	/**
	 * Stops every started server.
	 *
	 * Nothing is thrown out of here, because this runs while paullette is leaving, and a server that refuses to
	 * close must not turn a clean exit into a crash.
	 *
	 * @param startedServers The servers to stop.
	 * @returns Nothing.
	 */
	static async stopAll(startedServers: StartedModelContextProtocolServer[]): Promise<void> {
		for (const startedServer of startedServers) {
			try {
				await startedServer.server.close();
			} catch {
				// A server that will not close is left to the operating system to clean up.
			}
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds the server object that matches the transport the entry asks for.
	 *
	 * @param serverDefinition The declared server.
	 * @param workingDirectoryPath The folder a standard input and output server runs in when it names no folder.
	 * @returns The server, not yet connected.
	 */
	private static _build(
		serverDefinition: ModelContextProtocolServerDefinition,
		workingDirectoryPath: string,
	): MCPServer {
		const entry = serverDefinition.entry;

		const logger = ModelContextProtocolServerLauncher._createQuietLogger(serverDefinition.name);

		if ('command' in entry) {
			return new MCPServerStdio({
				name: serverDefinition.name,
				logger: logger,
				command: entry.command,
				args: entry.args ?? [],
				env: {
					...(process.env as Record<string, string>),
					...(entry.env ?? {}),
				},
				cwd: entry.cwd ?? workingDirectoryPath,
				cacheToolsList: true,
			});
		}

		if (entry.type === 'sse') {
			return new MCPServerSSE({
				name: serverDefinition.name,
				logger: logger,
				url: entry.url,
				cacheToolsList: true,
				requestInit: {
					headers: entry.headers ?? {},
				},
			});
		}

		return new MCPServerStreamableHttp({
			name: serverDefinition.name,
			logger: logger,
			url: entry.url,
			cacheToolsList: true,
			requestInit: {
				headers: entry.headers ?? {},
			},
		});
	}

	/**
	 * Builds a logger that says nothing.
	 *
	 * The OpenAI Agents software development kit writes its own line whenever a server fails, and that line
	 * names the failure as `object`. paullette already writes a full sentence saying which server failed, where
	 * it was declared, and why, so the line of the software development kit only competes with it.
	 *
	 * @param serverName The name of the server, kept as the namespace of the logger.
	 * @returns The logger.
	 */
	private static _createQuietLogger(serverName: string): ModelContextProtocolLogger {
		return {
			namespace: `paullette:model-context-protocol:${serverName}`,
			debug: () => {},
			error: () => {},
			warn: () => {},
			dontLogModelData: true,
			dontLogToolData: true,
		};
	}

	/**
	 * Connects one server, and gives up after the start timeout.
	 *
	 * @param server The server to connect.
	 * @returns Nothing.
	 * @throws When the server does not answer inside the start timeout, or when connecting fails.
	 */
	private static async _connectWithTimeout(server: MCPServer): Promise<void> {
		let timeoutHandle: NodeJS.Timeout | undefined = undefined;

		const timeoutPromise = new Promise<never>((_resolve, reject) => {
			timeoutHandle = setTimeout(() => {
				reject(
					new Error(
						`it did not answer inside ${SERVER_START_TIMEOUT_MILLISECONDS} milliseconds`,
					),
				);
			}, SERVER_START_TIMEOUT_MILLISECONDS);
		});

		try {
			await Promise.race([server.connect(), timeoutPromise]);
		} finally {
			if (timeoutHandle !== undefined) {
				clearTimeout(timeoutHandle);
			}
		}
	}
}
