import Readline from 'node:readline/promises';

import Chalk from 'chalk';

import {
	type PermissionAsker,
	type PermissionDecision,
	type PermissionRequest,
} from 'paullette-core/tools/tool_types';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PermissionPrompt — asks the user at the terminal before a tool changes anything
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The largest amount of detail shown to the user before a decision, so that one enormous file content does not
 * scroll the question itself off the screen.
 */
const SHOWN_DETAIL_CHARACTER_COUNT = 1200;

/**
 * Asks the user at the terminal before a tool changes anything on disk or runs a shell command.
 */
export class PermissionPrompt implements PermissionAsker {
	/** False when the user asked for every request to be approved without asking, with the `--yes` option. */
	private readonly _isAskingEnabled: boolean;
	/** The tools the user answered "always" for. Remembered for this session only, never written to disk. */
	private readonly _alwaysAllowedToolNames: Set<string>;
	/** The readline interface to ask on, when the interactive loop already owns one. */
	private _readlineInterface: Readline.Interface | null;

	/**
	 * Builds the permission prompt.
	 *
	 * @param isAskingEnabled False to approve every request without asking, which is what `--yes` does.
	 */
	constructor(isAskingEnabled: boolean) {
		this._isAskingEnabled = isAskingEnabled;
		this._alwaysAllowedToolNames = new Set<string>();
		this._readlineInterface = null;
	}

	/**
	 * Hands the prompt the readline interface the interactive loop already owns, so that two interfaces never
	 * read from the terminal at the same time.
	 *
	 * @param readlineInterface The interface to ask on.
	 * @returns Nothing.
	 */
	setReadlineInterface(readlineInterface: Readline.Interface | null): void {
		this._readlineInterface = readlineInterface;
	}

	/**
	 * Asks the user whether a tool may do what it is about to do.
	 *
	 * When there is no terminal to ask at, the answer is no. That is the safe direction: paullette running with
	 * its input closed, from a script or from a check, must never change a file that nobody approved.
	 *
	 * @param request What the tool is about to do.
	 * @returns Whether the tool may go ahead.
	 */
	async ask(request: PermissionRequest): Promise<PermissionDecision> {
		if (this._isAskingEnabled === false) {
			return 'allowed';
		}

		if (this._alwaysAllowedToolNames.has(request.toolName) === true) {
			return 'allowed';
		}

		if (process.stdin.isTTY !== true) {
			process.stderr.write(
				`paullette refused ${request.toolName} (${request.summary}): there is no terminal to ask at. ` +
					'Use --yes to approve every request.\n',
			);
			return 'refused';
		}

		return await this._askAtTerminal(request);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Prints the request and reads the answer of the user.
	 *
	 * @param request What the tool is about to do.
	 * @returns Whether the tool may go ahead.
	 */
	private async _askAtTerminal(request: PermissionRequest): Promise<PermissionDecision> {
		process.stderr.write(`\n${Chalk.yellow('paullette wants to')} ${request.summary}\n`);

		if (request.detail !== undefined && request.detail.length > 0) {
			const shownDetail = request.detail.slice(0, SHOWN_DETAIL_CHARACTER_COUNT);
			const indentedDetail = shownDetail
				.split('\n')
				.map((line) => `  ${Chalk.dim(line)}`)
				.join('\n');
			process.stderr.write(`${indentedDetail}\n`);
		}

		const ownsInterface = this._readlineInterface === null;
		const readlineInterface =
			this._readlineInterface ??
			Readline.createInterface({
				input: process.stdin,
				output: process.stderr,
			});

		try {
			const answer = await readlineInterface.question(`  allow? [y]es / [n]o / [a]lways ${request.toolName}: `);
			const firstLetter = answer.trim().toLowerCase().charAt(0);

			if (firstLetter === 'a') {
				this._alwaysAllowedToolNames.add(request.toolName);
				return 'allowed';
			}

			return firstLetter === 'y' ? 'allowed' : 'refused';
		} finally {
			if (ownsInterface === true) {
				readlineInterface.close();
			}
		}
	}
}
