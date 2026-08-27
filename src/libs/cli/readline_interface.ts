import Readline from 'node:readline/promises';

import { type Agent } from '@openai/agents';

import { type DoublureConfig } from '../config/config_types.ts';
import { InputHistoryStore } from '../history/input_history_store.ts';
import { type ConversationSession } from './conversation_session.ts';
import { OutputRenderer } from './output_renderer.ts';
import { type PermissionPrompt } from './permission_prompt.ts';
import { type SlashCommandHandler } from './slash_command_handler.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ReadlineInterface — the read, answer, and repeat loop at the terminal
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * How many typed lines the up arrow key can reach back through.
 */
const INPUT_HISTORY_SIZE = 1000;

/**
 * Everything the interactive loop needs.
 */
export type ReadlineInterfaceRequest = {
	/** The configuration doublure is running with. */
	config: DoublureConfig;
	/** The agent that answers. */
	agent: Agent;
	/** The conversation being held. */
	conversationSession: ConversationSession;
	/** Deals with a typed line that starts with a slash. */
	slashCommandHandler: SlashCommandHandler;
	/** Told about the readline interface, so that two things never read the terminal at once. */
	permissionPrompt: PermissionPrompt;
	/** Remembers the typed lines between runs. */
	inputHistoryStore: InputHistoryStore;
	/** The folder doublure is working in, shown when the loop starts. */
	projectRootPath: string;
};

/**
 * The read, answer, and repeat loop at the terminal.
 */
export class ReadlineInterface {
	/** Everything the loop needs. */
	private readonly _request: ReadlineInterfaceRequest;
	/** How many times the interrupt key has been pressed since the last line was typed. */
	private _interruptCount: number;

	/**
	 * Builds the interactive loop.
	 *
	 * @param request Everything the loop needs.
	 */
	constructor(request: ReadlineInterfaceRequest) {
		this._request = request;
		this._interruptCount = 0;
	}

	/**
	 * Runs the loop until the user leaves.
	 *
	 * The loop ends in three ways, and all three save the conversation, because the conversation is written to
	 * disk at the start of every turn rather than only when it ends. Typing `/exit` ends it, pressing the
	 * interrupt key twice ends it, and closing the input stream ends it.
	 *
	 * @returns Nothing.
	 */
	async run(): Promise<void> {
		const readlineInterface = Readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			history: this._request.inputHistoryStore.load(),
			historySize: INPUT_HISTORY_SIZE,
			terminal: true,
		});

		this._request.permissionPrompt.setReadlineInterface(readlineInterface);

		readlineInterface.on('SIGINT', () => {
			this._interruptCount += 1;

			if (this._interruptCount >= 2) {
				OutputRenderer.writeNotice(
					`\nLeaving. The conversation is in ${this._request.conversationSession.sessionFilePath}`,
				);
				readlineInterface.close();
				return;
			}

			OutputRenderer.writeNotice('\nPress the interrupt key again to leave, or type /exit.');
		});

		OutputRenderer.writeBanner(
			this._request.config.modelName,
			this._request.config.baseUrl,
			this._request.projectRootPath,
		);

		let isRunning = true;
		readlineInterface.on('close', () => {
			isRunning = false;
		});

		while (isRunning === true) {
			let line: string;
			try {
				line = await readlineInterface.question('> ');
			} catch {
				break;
			}

			this._interruptCount = 0;

			const trimmedLine = line.trim();
			if (trimmedLine.length === 0) {
				continue;
			}

			this._request.inputHistoryStore.append(trimmedLine);

			const shouldQuit = await this._handleLine(trimmedLine);
			if (shouldQuit === true) {
				break;
			}
		}

		this._request.permissionPrompt.setReadlineInterface(null);
		readlineInterface.close();

		OutputRenderer.writeNotice(`The conversation is in ${this._request.conversationSession.sessionFilePath}`);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Deals with one typed line: a slash command, or a message for the model.
	 *
	 * @param line The line the user typed.
	 * @returns True when the user asked to leave.
	 */
	private async _handleLine(line: string): Promise<boolean> {
		const outcome = await this._request.slashCommandHandler.handle(line);

		if (outcome.kind === 'quit') {
			return true;
		}
		if (outcome.kind === 'handled') {
			return false;
		}

		const promptText = outcome.kind === 'prompt' ? outcome.text : line;
		await this._runTurn(promptText);
		return false;
	}

	/**
	 * Sends one message to the model and prints the answer as it arrives.
	 *
	 * @param promptText The message of the user.
	 * @returns Nothing.
	 */
	private async _runTurn(promptText: string): Promise<void> {
		try {
			await this._request.conversationSession.runTurn(
				this._request.agent,
				promptText,
				this._request.config.maximumTurnCount,
				(textChunk) => OutputRenderer.writeAnswerChunk(textChunk),
			);
			OutputRenderer.endAnswer();
		} catch (caughtError) {
			const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);
			OutputRenderer.writeError(`doublure could not answer: ${reason}`);
		}
	}
}
