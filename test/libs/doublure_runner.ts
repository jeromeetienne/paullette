import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';

import {
	CAPABILITY_LINE_PREFIX,
	VERIFICATION_BASE_URL,
	VERIFICATION_MODEL_NAME,
	type DoublureCapabilities,
} from './verification_types.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	DoublureRunner — starts doublure without a terminal and captures what it wrote
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The absolute path of the repository root, which is two folders above this file.
 */
const REPOSITORY_ROOT_PATH = Path.resolve(__dirname, '..', '..');

/**
 * The absolute path of the command line entry point of doublure.
 */
const MAIN_FILE_PATH = Path.join(REPOSITORY_ROOT_PATH, 'src', 'cli.ts');

/**
 * The absolute path of the fixture folder that every verification step starts from.
 */
const FIXTURE_FOLDER_PATH = Path.join(REPOSITORY_ROOT_PATH, 'test', 'fixture');

/**
 * What one run of doublure produced.
 */
export type RunOutcome = {
	/** False when `src/cli.ts` does not exist yet, which means the step that asked for the run cannot run. */
	isBuilt: boolean;
	/** The status doublure exited with, or null when it was stopped by the timeout. */
	exitCode: number | null;
	/** Everything doublure wrote to its standard output, which is the answer of the model. */
	standardOutput: string;
	/** Everything doublure wrote to its standard error, which is the log of the tool calls. */
	standardError: string;
	/** True when doublure was still running when the timeout ran out. */
	isTimedOut: boolean;
	/** The folder doublure ran in, so that a step can look at the files it left behind. */
	workingDirectoryPath: string;
	/** What doublure said it can currently do, or null when it printed no capability line. */
	capabilities: DoublureCapabilities | null;
};

/**
 * The values one run of doublure needs.
 */
export type RunRequest = {
	/** The folder doublure runs in, which is also the folder it treats as the project root. */
	workingDirectoryPath: string;
	/** The options and arguments given to doublure, for example `['--print', 'hello']`. */
	commandLineArguments: string[];
	/** How long to wait before stopping doublure. A local model needs a generous value here. */
	timeoutMilliseconds?: number;
};

/**
 * Starts doublure without a terminal and captures what it wrote.
 *
 * Every verification step goes through this class rather than starting doublure itself, so that there is one
 * place that knows how doublure is started and one place that decides whether doublure exists yet.
 */
export class DoublureRunner {
	/**
	 * Runs doublure once and waits for it to exit.
	 *
	 * The standard input is closed, so doublure sees that there is no terminal. That is what a verification step
	 * relies on when it checks that the permission prompt refuses by default.
	 *
	 * @param request The folder to run in, the command line arguments, and the timeout.
	 * @returns What the run produced.
	 */
	static async run(request: RunRequest): Promise<RunOutcome> {
		if (DoublureRunner.isBuilt() === false) {
			return {
				isBuilt: false,
				exitCode: null,
				standardOutput: '',
				standardError: '',
				isTimedOut: false,
				workingDirectoryPath: request.workingDirectoryPath,
				capabilities: null,
			};
		}

		const timeoutMilliseconds = request.timeoutMilliseconds ?? 240000;

		return await new Promise<RunOutcome>((resolve) => {
			const childProcess = ChildProcess.spawn(
				'npx',
				['tsx', MAIN_FILE_PATH, ...request.commandLineArguments],
				{
					cwd: request.workingDirectoryPath,
					stdio: ['ignore', 'pipe', 'pipe'],
					env: {
						...process.env,
						NO_COLOR: '1',
						DOUBLURE_BASE_URL: VERIFICATION_BASE_URL,
						DOUBLURE_MODEL: VERIFICATION_MODEL_NAME,
					},
				},
			);

			let standardOutput = '';
			let standardError = '';
			let isTimedOut = false;

			const timeoutHandle = setTimeout(() => {
				isTimedOut = true;
				childProcess.kill('SIGKILL');
			}, timeoutMilliseconds);

			childProcess.stdout.on('data', (chunk: Buffer) => {
				standardOutput += chunk.toString('utf8');
			});

			childProcess.stderr.on('data', (chunk: Buffer) => {
				standardError += chunk.toString('utf8');
			});

			childProcess.on('close', (exitCode) => {
				clearTimeout(timeoutHandle);
				resolve({
					isBuilt: true,
					exitCode: exitCode,
					standardOutput: standardOutput,
					standardError: standardError,
					isTimedOut: isTimedOut,
					workingDirectoryPath: request.workingDirectoryPath,
					capabilities: DoublureRunner.readCapabilities(standardError),
				});
			});

			childProcess.on('error', (caughtError) => {
				clearTimeout(timeoutHandle);
				resolve({
					isBuilt: true,
					exitCode: null,
					standardOutput: standardOutput,
					standardError: `${standardError}\n${caughtError.message}`,
					isTimedOut: isTimedOut,
					workingDirectoryPath: request.workingDirectoryPath,
					capabilities: DoublureRunner.readCapabilities(standardError),
				});
			});
		});
	}

	/**
	 * Reads the capability line doublure writes to its standard error on every run.
	 *
	 * @param standardError Everything doublure wrote to its standard error.
	 * @returns What doublure said it can do, or null when it printed no capability line.
	 */
	static readCapabilities(standardError: string): DoublureCapabilities | null {
		const capabilityLine = standardError
			.split('\n')
			.reverse()
			.find((line) => line.trim().startsWith(CAPABILITY_LINE_PREFIX) === true);

		if (capabilityLine === undefined) {
			return null;
		}

		const jsonText = capabilityLine.trim().slice(CAPABILITY_LINE_PREFIX.length).trim();
		try {
			return JSON.parse(jsonText) as DoublureCapabilities;
		} catch {
			return null;
		}
	}

	/**
	 * Says whether the command line entry point of doublure exists yet.
	 *
	 * @returns True when `src/cli.ts` exists.
	 */
	static isBuilt(): boolean {
		return Fs.existsSync(MAIN_FILE_PATH);
	}

	/**
	 * Says whether doublure rejected an option it does not know about. A verification step treats that as work
	 * still to do rather than as a failure, because the option is part of the plan and not yet written.
	 *
	 * @param outcome What the run produced.
	 * @returns True when doublure complained about an unknown option or an unknown argument.
	 */
	static isOptionUnsupported(outcome: RunOutcome): boolean {
		const combinedOutput = `${outcome.standardOutput}\n${outcome.standardError}`.toLowerCase();
		const unsupportedMarkers = ['unknown option', 'unknown argument', 'unknown command', 'not implemented'];
		return unsupportedMarkers.some((marker) => combinedOutput.includes(marker));
	}

	/**
	 * Makes an empty temporary folder for a run.
	 *
	 * The folder holds no `.git`, so doublure treats the folder itself as the project root, and no `.doublure`,
	 * so a run in it shows whether doublure creates the folder it needs.
	 *
	 * @returns The absolute path of the new folder.
	 */
	static makeEmptyFolder(): string {
		return Fs.mkdtempSync(Path.join(Os.tmpdir(), 'doublure-verify-empty-'));
	}

	/**
	 * Makes a temporary folder holding a copy of the fixture, which carries one instruction document, one
	 * subagent, one slash command, and one skill.
	 *
	 * The copy matters: a verification step writes files, and it must never write them into the repository.
	 *
	 * @returns The absolute path of the new folder.
	 */
	static makeFixtureFolder(): string {
		const folderPath = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'doublure-verify-fixture-'));
		Fs.cpSync(FIXTURE_FOLDER_PATH, folderPath, {
			recursive: true,
		});
		return folderPath;
	}

	/**
	 * Removes a temporary folder made by this class.
	 *
	 * @param folderPath The absolute path returned by `makeEmptyFolder` or `makeFixtureFolder`.
	 * @returns Nothing.
	 */
	static removeFolder(folderPath: string): void {
		if (folderPath.includes('doublure-verify-') === false) {
			throw new Error(`refusing to remove ${folderPath}, which this class did not make`);
		}
		Fs.rmSync(folderPath, {
			recursive: true,
			force: true,
		});
	}
}
