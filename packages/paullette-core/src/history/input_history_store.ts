import Fs from 'node:fs';
import Path from 'node:path';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	InputHistoryStore — remembers the lines the user typed, across runs
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * How many typed lines are kept. Older lines are dropped so that the file cannot grow without end.
 */
const MAXIMUM_LINE_COUNT = 1000;

/**
 * Remembers the lines the user typed, so that the up arrow key reaches back into earlier runs.
 *
 * This is a different thing from the conversation, which `SessionStore` keeps. This one is only what was typed,
 * and it exists so that a person can call back a long question they asked yesterday without typing it again.
 */
export class InputHistoryStore {
	/** The absolute path of the file the typed lines are kept in. */
	private readonly _filePath: string;

	/**
	 * Builds the input history store.
	 *
	 * @param filePath The absolute path of `.paullette/input_history.txt`.
	 */
	constructor(filePath: string) {
		this._filePath = filePath;
	}

	/**
	 * Reads the lines the user typed in earlier runs.
	 *
	 * @returns The lines, newest first, which is the order the `history` option of readline expects.
	 */
	load(): string[] {
		if (Fs.existsSync(this._filePath) === false) {
			return [];
		}

		try {
			const lines = Fs.readFileSync(this._filePath, 'utf8')
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0);

			return lines.reverse();
		} catch {
			return [];
		}
	}

	/**
	 * Adds one typed line, dropping the oldest lines when there are too many.
	 *
	 * A line the same as the one before it is not added twice, because calling the same thing back twice in a
	 * row is never what a person wants from the up arrow key.
	 *
	 * @param line The line the user typed.
	 * @returns Nothing.
	 */
	append(line: string): void {
		const trimmedLine = line.trim();
		if (trimmedLine.length === 0) {
			return;
		}

		Fs.mkdirSync(Path.dirname(this._filePath), {
			recursive: true,
		});

		const existingLines = this.load().reverse();
		if (existingLines[existingLines.length - 1] === trimmedLine) {
			return;
		}

		const keptLines = [...existingLines, trimmedLine].slice(-MAXIMUM_LINE_COUNT);
		Fs.writeFileSync(this._filePath, `${keptLines.join('\n')}\n`, 'utf8');
	}
}
