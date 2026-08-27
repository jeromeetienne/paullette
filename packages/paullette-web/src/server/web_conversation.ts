import { type Agent } from '@openai/agents';

import { type ConversationSession } from 'paullette-core/agent/conversation_session';
import { type ConversationHistoryItem, type StoredSession } from 'paullette-core/history/history_types';
import { type SessionStore } from 'paullette-core/history/session_store';
import { type PermissionDecision } from 'paullette-core/tools/tool_types';
import { type WebEventStream } from './web_event_stream.ts';
import { WebMarkdown } from './web_markdown.ts';
import { type WebPermissionAsker } from './web_permission_asker.ts';
import { type WebConversationMessage, type WebSessionSummary, type WebState } from './web_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebConversation — one conversation, one turn at a time, told to every browser
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Everything the conversation needs, all of it built at startup by `cli.ts` and shared with the terminal
 * interface. No part of it is built here, because neither front end holds agent logic of its own.
 */
export type WebConversationRequest = {
	/** The agent that answers. */
	agent: Agent;
	/** The conversation being held, either newly started or read back from disk. */
	conversationSession: ConversationSession;
	/** The store the past conversations are read from. */
	sessionStore: SessionStore;
	/** Asks the browser before a tool changes anything. */
	permissionAsker: WebPermissionAsker;
	/** Writes what happens to every browser that is reading. */
	eventStream: WebEventStream;
	/** The model the conversation is held with. */
	modelName: string;
	/** The folder the agent reads files from and runs shell commands in. */
	workingDirectoryPath: string;
	/** The largest number of model turns one message may take. */
	maximumTurnCount: number;
};

/**
 * What happened when a browser asked to send a message.
 */
export type SendMessageOutcome = {
	/** True when the turn was started, false when it was refused. */
	isStarted: boolean;
	/** Why it was refused, in words a person can read, or null when it was started. */
	refusedReason: string | null;
};

/**
 * One conversation, held by one running server and shared by every browser that connects.
 *
 * Only one turn runs at a time. A message sent while a turn is running is refused rather than queued, because
 * the agent runs tools in one working folder and two turns at once would edit the same files with neither one
 * knowing. The reasons are in the plan on issue 9.
 */
export class WebConversation {
	/** Everything the conversation needs. */
	private readonly _request: WebConversationRequest;
	/** Everything said so far, as the page shows it. */
	private readonly _messages: WebConversationMessage[];
	/** True while a turn is running. */
	private _isTurnRunning: boolean;

	/**
	 * Builds the conversation.
	 *
	 * @param request Everything the conversation needs.
	 */
	constructor(request: WebConversationRequest) {
		this._request = request;
		this._messages = WebConversation._readMessages(request.conversationSession.history);
		this._isTurnRunning = false;

		request.permissionAsker.setWaitingListener((waiting) => {
			request.eventStream.send({
				kind: 'permissionRequested',
				identifier: waiting.identifier,
				toolName: waiting.request.toolName,
				summary: waiting.request.summary,
				detail: waiting.request.detail ?? null,
			});
		});
	}

	/**
	 * Everything a browser that has just connected needs in order to draw the page.
	 *
	 * @returns The conversation so far, and the question waiting for an answer.
	 */
	readState(): WebState {
		const waiting = this._request.permissionAsker.waitingPermission;

		return {
			sessionIdentifier: this._request.conversationSession.sessionIdentifier,
			modelName: this._request.modelName,
			workingDirectoryPath: this._request.workingDirectoryPath,
			messages: [...this._messages],
			isTurnRunning: this._isTurnRunning,
			pendingPermission:
				waiting === null
					? null
					: {
							identifier: waiting.identifier,
							toolName: waiting.request.toolName,
							summary: waiting.request.summary,
							detail: waiting.request.detail ?? null,
						},
		};
	}

	/**
	 * Starts one turn, and answers at once without waiting for it.
	 *
	 * The browser is told what happens over the stream it already has open, so the request that started the turn
	 * has nothing to wait for. Waiting would hold one request open for as long as the model thinks, and a
	 * browser that reloaded the page would lose the turn.
	 *
	 * @param message The message of the user.
	 * @returns Whether the turn was started, and why it was refused when it was not.
	 */
	sendMessage(message: string): SendMessageOutcome {
		if (message.trim().length === 0) {
			return {
				isStarted: false,
				refusedReason: 'The message is empty.',
			};
		}

		if (this._isTurnRunning === true) {
			return {
				isStarted: false,
				refusedReason: 'paullette is still answering the message before this one.',
			};
		}

		this._isTurnRunning = true;
		this._messages.push({
			role: 'user',
			html: `<p>${WebMarkdown.escape(message)}</p>`,
		});
		this._request.eventStream.send({
			kind: 'turnStarted',
			message: message,
		});

		void this._runTurn(message);

		return {
			isStarted: true,
			refusedReason: null,
		};
	}

	/**
	 * Answers one waiting permission question, releasing the tool that is parked on it.
	 *
	 * @param identifier The question being answered.
	 * @param decision What the user answered.
	 * @param isAlways True to answer the same way for every later call of the same tool, for this run only.
	 * @returns True when there was such a question waiting, false when there was not.
	 */
	answerPermission(identifier: string, decision: PermissionDecision, isAlways: boolean): boolean {
		const wasAnswered = this._request.permissionAsker.answer(identifier, decision, isAlways);

		if (wasAnswered === true) {
			this._request.eventStream.send({
				kind: 'permissionAnswered',
				identifier: identifier,
				decision: decision,
			});
		}

		return wasAnswered;
	}

	/**
	 * Lists the past conversations in `.paullette/sessions`, newest first.
	 *
	 * @returns One summary per session.
	 */
	listSessions(): WebSessionSummary[] {
		return this._request.sessionStore.listSessions().map((summary) => ({
			identifier: summary.identifier,
			startedAt: summary.startedAt,
			modelName: summary.modelName,
			itemCount: summary.itemCount,
		}));
	}

	/**
	 * Reads back one past conversation, as the page shows it.
	 *
	 * @param identifier The name of the session.
	 * @returns Everything said in it, or null when there is no such session.
	 */
	readSessionMessages(identifier: string): WebConversationMessage[] | null {
		const storedSession: StoredSession | null = this._request.sessionStore.loadSession(identifier);

		if (storedSession === null) {
			return null;
		}

		return WebConversation._readMessages(storedSession.history);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Runs one turn and tells every browser what happens, then lets the next message be sent.
	 *
	 * Nothing thrown in here reaches the caller. The request that started the turn has already been answered, so
	 * an error that got out would end the process rather than reach anybody who could read it.
	 *
	 * @param message The message of the user.
	 * @returns Nothing.
	 */
	private async _runTurn(message: string): Promise<void> {
		let answerText = '';

		try {
			await this._request.conversationSession.runTurn(
				this._request.agent,
				message,
				this._request.maximumTurnCount,
				(turnEvent) => {
					if (turnEvent.kind === 'text') {
						answerText += turnEvent.delta;
						this._request.eventStream.send({
							kind: 'text',
							delta: turnEvent.delta,
						});
						return;
					}

					if (turnEvent.kind === 'toolCalled') {
						this._request.eventStream.send({
							kind: 'toolCalled',
							toolName: turnEvent.toolName,
						});
						return;
					}

					this._request.eventStream.send({
						kind: 'toolOutput',
						toolName: turnEvent.toolName,
					});
				},
			);

			const html = WebMarkdown.toHtml(answerText);
			this._messages.push({
				role: 'assistant',
				html: html,
			});
			this._request.eventStream.send({
				kind: 'answerRendered',
				html: html,
			});
		} catch (caughtError) {
			const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
			this._request.eventStream.send({
				kind: 'error',
				message: `paullette could not answer: ${reason}`,
			});
		} finally {
			this._isTurnRunning = false;
			this._request.eventStream.send({
				kind: 'turnEnded',
			});
		}
	}

	/**
	 * Turns a conversation as it is stored into the messages the page shows.
	 *
	 * An item whose shape is not one of the two the page shows — a message of the user and a message of the
	 * model — is passed over. The shape of an item is decided by the OpenAI Agents SDK and by the endpoint, and
	 * a page that showed nothing at all because of one unexpected item would be worse than a page that shows
	 * what it recognised.
	 *
	 * @param history Everything said, as it is stored.
	 * @returns One message per thing the page shows.
	 */
	private static _readMessages(history: ConversationHistoryItem[]): WebConversationMessage[] {
		const messages: WebConversationMessage[] = [];

		for (const item of history) {
			if (typeof item !== 'object' || item === null) {
				continue;
			}

			const role = 'role' in item ? item.role : undefined;
			if (role !== 'user' && role !== 'assistant') {
				continue;
			}

			const text = WebConversation._readItemText('content' in item ? item.content : undefined);
			if (text.length === 0) {
				continue;
			}

			messages.push({
				role: role,
				html: role === 'user' ? `<p>${WebMarkdown.escape(text)}</p>` : WebMarkdown.toHtml(text),
			});
		}

		return messages;
	}

	/**
	 * Reads the text out of the content of one stored item.
	 *
	 * The content is a plain string on some endpoints and a list of parts on others, so both are read.
	 *
	 * @param content The content of the item, whatever shape it has.
	 * @returns The text of the item, or an empty string when it carries none.
	 */
	private static _readItemText(content: unknown): string {
		if (typeof content === 'string') {
			return content;
		}

		if (Array.isArray(content) === false) {
			return '';
		}

		const parts: string[] = [];

		for (const part of content) {
			if (typeof part === 'object' && part !== null && 'text' in part) {
				const text = (part as { text: unknown }).text;
				if (typeof text === 'string') {
					parts.push(text);
				}
			}
		}

		return parts.join('');
	}
}
