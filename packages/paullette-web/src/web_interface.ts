import { type Agent } from '@openai/agents';

import { type ConversationSession } from 'paullette-core/agent/conversation_session';
import { type SessionStore } from 'paullette-core/history/session_store';
import { WebConversation } from './server/web_conversation.ts';
import { WebEventStream } from './server/web_event_stream.ts';
import { type WebPermissionAsker } from './server/web_permission_asker.ts';
import { WebServer } from './server/web_server.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebInterface — the one thing paullette-cli imports from this package
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The default port, which is the one the example in issue 2 shows.
 */
export const DEFAULT_WEB_PORT = 3000;

/**
 * The default address to listen on. It is the loopback address, because the agent behind this server runs shell
 * commands and writes files on the machine it is started on.
 */
export const DEFAULT_WEB_HOST = '127.0.0.1';

/**
 * Everything the web interface is given. All of it is built at startup by `cli.ts` and shared with the terminal
 * interface, so that both front ends answer with the same agent.
 */
export type WebInterfaceRequest = {
	/** The agent that answers. */
	agent: Agent;
	/** The conversation being held, either newly started or read back from disk. */
	conversationSession: ConversationSession;
	/** The store the past conversations are read from. */
	sessionStore: SessionStore;
	/** Asks the browser before a tool changes anything. It is the one inside the `ToolContext` of every tool. */
	permissionAsker: WebPermissionAsker;
	/** The model the conversation is held with. */
	modelName: string;
	/** The folder the agent reads files from and runs shell commands in. */
	workingDirectoryPath: string;
	/** The largest number of model turns one message may take. */
	maximumTurnCount: number;
	/** The address to listen on. */
	host: string;
	/** The port to listen on. Zero asks the operating system for a free one. */
	port: number;
};

/**
 * What was started, and how to stop it.
 */
export type StartedWebInterface = {
	/** The address a person types into a browser. */
	address: string;
	/** Stops listening, closes every open stream, and refuses every question still waiting. */
	close: () => Promise<void>;
};

/**
 * Starts the web interface of paullette.
 */
export class WebInterface {
	/**
	 * Builds the conversation, builds the server, and starts listening.
	 *
	 * @param request Everything the web interface is given.
	 * @returns The address to print, and how to stop the server.
	 */
	static async start(request: WebInterfaceRequest): Promise<StartedWebInterface> {
		const eventStream = new WebEventStream();

		const conversation = new WebConversation({
			agent: request.agent,
			conversationSession: request.conversationSession,
			sessionStore: request.sessionStore,
			permissionAsker: request.permissionAsker,
			eventStream: eventStream,
			modelName: request.modelName,
			workingDirectoryPath: request.workingDirectoryPath,
			maximumTurnCount: request.maximumTurnCount,
		});

		const webServer = new WebServer({
			conversation: conversation,
			eventStream: eventStream,
			permissionAsker: request.permissionAsker,
			host: request.host,
			port: request.port,
		});

		const address = await webServer.listen();

		return {
			address: address,
			close: async () => await webServer.close(),
		};
	}
}
