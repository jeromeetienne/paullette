import Chalk from 'chalk';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OutputRenderer — everything doublure prints at the terminal
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Everything doublure prints at the terminal.
 *
 * The answer of the model goes to the standard output. Everything doublure says about its own working goes to the
 * standard error, so that a caller reading the standard output gets the answer on its own.
 */
export class OutputRenderer {
	/**
	 * Prints the few lines shown when the interactive loop starts.
	 *
	 * @param modelName The model the conversation will be held with.
	 * @param baseUrl The endpoint the model is served from.
	 * @param projectRootPath The folder doublure is working in.
	 * @returns Nothing.
	 */
	static writeBanner(modelName: string, baseUrl: string, projectRootPath: string): void {
		process.stderr.write(`\n${Chalk.bold('doublure')} ${Chalk.dim(`${modelName} at ${baseUrl}`)}\n`);
		process.stderr.write(`${Chalk.dim(projectRootPath)}\n`);
		process.stderr.write(`${Chalk.dim('Type /help for the commands, /exit to leave.')}\n\n`);
	}

	/**
	 * Prints one line about what doublure is doing, rather than about the answer.
	 *
	 * @param text The line to print.
	 * @returns Nothing.
	 */
	static writeNotice(text: string): void {
		process.stderr.write(`${Chalk.dim(text)}\n`);
	}

	/**
	 * Prints one line about something that went wrong.
	 *
	 * @param text The line to print.
	 * @returns Nothing.
	 */
	static writeError(text: string): void {
		process.stderr.write(`${Chalk.red(text)}\n`);
	}

	/**
	 * Prints a heading followed by a list, or a line saying the list is empty.
	 *
	 * @param heading The heading.
	 * @param lines The lines of the list.
	 * @param emptyText What to print instead when the list is empty.
	 * @returns Nothing.
	 */
	static writeList(heading: string, lines: string[], emptyText: string): void {
		process.stderr.write(`\n${Chalk.bold(heading)}\n`);

		if (lines.length === 0) {
			process.stderr.write(`${Chalk.dim(emptyText)}\n\n`);
			return;
		}

		for (const line of lines) {
			process.stderr.write(`  ${line}\n`);
		}
		process.stderr.write('\n');
	}

	/**
	 * Prints part of the answer of the model, as it arrives.
	 *
	 * @param textChunk The next piece of the answer.
	 * @returns Nothing.
	 */
	static writeAnswerChunk(textChunk: string): void {
		process.stdout.write(textChunk);
	}

	/**
	 * Ends the answer of the model with a blank line.
	 *
	 * @returns Nothing.
	 */
	static endAnswer(): void {
		process.stdout.write('\n\n');
	}
}
