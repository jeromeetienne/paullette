import { type MCPServer } from '@openai/agents';

import { type ModelContextProtocolTool } from '../../src/model_context_protocol/model_context_protocol_tools.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	FakeModelContextProtocolServer — a Model Context Protocol server that answers from a list written by the test
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * What a Model Context Protocol server answers a call with, taken from the server interface of the OpenAI Agents
 * software development kit so that the shape never has to be restated here.
 */
type ModelContextProtocolCallResult = Awaited<ReturnType<MCPServer['callTool']>>;

/**
 * One call that reached the server, so that a test can check a refused call never got here.
 */
export type RecordedCall = {
	/** The name of the tool, as the server itself names it, without the name of the server in front of it. */
	toolName: string;
	/** The arguments the tool was called with. */
	args: Record<string, unknown> | null;
};

/**
 * A Model Context Protocol server that answers from a list of tools written by the test.
 *
 * A unit test may not start a real server, because that needs a program installed on the machine and reaches the
 * network. This stands in for one, and remembers every call so that a test can check what reached it.
 */
export class FakeModelContextProtocolServer implements MCPServer {
	/** Never used, and present because the server interface of the software development kit asks for it. */
	cacheToolsList = false;

	/** Every call that reached this server, in the order it was made. */
	readonly calls: RecordedCall[] = [];

	/** The name of the server, which is what the name of every one of its tools starts with. */
	private readonly _name: string;

	/** The tools this server says it has. */
	private readonly _tools: ModelContextProtocolTool[];

	/** The text every call answers with. */
	private readonly _answerText: string;

	/** The sentence `listTools` throws instead of answering, or null when it answers. */
	private readonly _listToolsFailureMessage: string | null;

	/**
	 * Builds the fake server.
	 *
	 * @param name The name of the server.
	 * @param toolNames The name of every tool the server says it has.
	 * @param answerText The text every call answers with.
	 * @param listToolsFailureMessage The sentence `listTools` throws, or null when it answers.
	 */
	constructor(
		name: string,
		toolNames: string[],
		answerText: string,
		listToolsFailureMessage: string | null = null,
	) {
		this._name = name;
		this._answerText = answerText;
		this._listToolsFailureMessage = listToolsFailureMessage;
		this._tools = toolNames.map((toolName) => ({
			name: toolName,
			description: `the tool ${toolName} of the server ${name}`,
			inputSchema: {
				type: 'object',
				properties: {
					question: {
						type: 'string',
					},
				},
				required: [],
				additionalProperties: false,
			},
		})) as ModelContextProtocolTool[];
	}

	/**
	 * The name of the server.
	 *
	 * @returns The name.
	 */
	get name(): string {
		return this._name;
	}

	/**
	 * Does nothing, because there is nothing to connect to.
	 *
	 * @returns Nothing.
	 */
	async connect(): Promise<void> {}

	/**
	 * Does nothing, because there is nothing to close.
	 *
	 * @returns Nothing.
	 */
	async close(): Promise<void> {}

	/**
	 * Says which tools this server has.
	 *
	 * @returns The tools.
	 * @throws When the server was built with a failure sentence.
	 */
	async listTools(): Promise<ModelContextProtocolTool[]> {
		if (this._listToolsFailureMessage !== null) {
			throw new Error(this._listToolsFailureMessage);
		}
		return this._tools;
	}

	/**
	 * Records the call and answers with the text this server was built with.
	 *
	 * @param toolName The name of the tool being called.
	 * @param args The arguments the tool was called with.
	 * @returns The answer, in the shape a real server answers in.
	 */
	async callTool(
		toolName: string,
		args: Record<string, unknown> | null,
	): Promise<ModelContextProtocolCallResult> {
		this.calls.push({
			toolName: toolName,
			args: args,
		});

		return [
			{
				type: 'text',
				text: this._answerText,
			},
		] as ModelContextProtocolCallResult;
	}

	/**
	 * Does nothing, because this server keeps no cache.
	 *
	 * @returns Nothing.
	 */
	async invalidateToolsCache(): Promise<void> {}
}
