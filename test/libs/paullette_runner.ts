import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';

import {
	CAPABILITY_LINE_PREFIX,
	VERIFICATION_BASE_URL,
	VERIFICATION_MODEL_NAME,
	type PaulletteCapabilities,
} from './verification_types.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PaulletteRunner — starts paullette without a terminal and captures what it wrote
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The absolute path of the repository root, which is two folders above this file.
 */
const REPOSITORY_ROOT_PATH = Path.resolve(__dirname, '..', '..');

/**
 * The absolute path of the command line entry point of paullette.
 */
const MAIN_FILE_PATH = Path.join(REPOSITORY_ROOT_PATH, 'packages', 'paullette-cli', 'src', 'cli.ts');

/**
 * The absolute path of the fixture folder that every verification step starts from.
 */
const FIXTURE_FOLDER_PATH = Path.join(REPOSITORY_ROOT_PATH, 'test', 'fixture');

/**
 * What one run of paullette produced.
 */
export type RunOutcome = {
	/** False when `packages/paullette-cli/src/cli.ts` does not exist yet, which means the step that asked for the run cannot run. */
	isBuilt: boolean;
	/** The status paullette exited with, or null when it was stopped by the timeout. */
	exitCode: number | null;
	/** Everything paullette wrote to its standard output, which is the answer of the model. */
	standardOutput: string;
	/** Everything paullette wrote to its standard error, which is the log of the tool calls. */
	standardError: string;
	/** True when paullette was still running when the timeout ran out. */
	isTimedOut: boolean;
	/** The folder paullette ran in, so that a step can look at the files it left behind. */
	workingDirectoryPath: string;
	/** What paullette said it can currently do, or null when it printed no capability line. */
	capabilities: PaulletteCapabilities | null;
};

/**
 * The values one run of paullette needs.
 */
export type RunRequest = {
	/** The folder paullette runs in, which is also the folder it treats as the project root. */
	workingDirectoryPath: string;
	/** The options and arguments given to paullette, for example `['--print', 'hello']`. */
	commandLineArguments: string[];
	/** How long to wait before stopping paullette. A local model needs a generous value here. */
	timeoutMilliseconds?: number;
};

/**
 * The values one run of the web interface needs.
 */
export type ServeRequest = {
	/** The folder paullette runs in, which is also the folder it treats as the project root. */
	workingDirectoryPath: string;
	/** Anything to add after `web --port 0`, for example `['--yes']`. */
	extraArguments?: string[];
	/**
	 * Called once the server has printed its address, and awaited before the server is stopped.
	 *
	 * @param address The address paullette printed, for example `http://127.0.0.1:53874`.
	 * @returns Nothing.
	 */
	whileServing: (address: string) => Promise<void>;
	/** How long to wait for the address line before giving up. */
	timeoutMilliseconds?: number;
};

/**
 * What one run of the web interface produced.
 */
export type ServeOutcome = {
	/** False when `packages/paullette-cli/src/cli.ts` does not exist yet. */
	isBuilt: boolean;
	/** True when the server printed an address, which is what says the web command exists and listens. */
	isServed: boolean;
	/** The address the server printed, or null when it printed none. */
	address: string | null;
	/** Everything paullette wrote to its standard output, which holds the address line. */
	standardOutput: string;
	/** Everything paullette wrote to its standard error. */
	standardError: string;
	/** The folder paullette ran in, so that a step can look at the files it left behind. */
	workingDirectoryPath: string;
	/** What paullette said it can currently do, or null when it printed no capability line. */
	capabilities: PaulletteCapabilities | null;
};

/**
 * Starts paullette without a terminal and captures what it wrote.
 *
 * Every verification step goes through this class rather than starting paullette itself, so that there is one
 * place that knows how paullette is started and one place that decides whether paullette exists yet.
 */
export class PaulletteRunner {
	/**
	 * Runs paullette once and waits for it to exit.
	 *
	 * The standard input is closed, so paullette sees that there is no terminal. That is what a verification step
	 * relies on when it checks that the permission prompt refuses by default.
	 *
	 * @param request The folder to run in, the command line arguments, and the timeout.
	 * @returns What the run produced.
	 */
	static async run(request: RunRequest): Promise<RunOutcome> {
		if (PaulletteRunner.isBuilt() === false) {
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
				['tsx', '--conditions=development', MAIN_FILE_PATH, ...request.commandLineArguments],
				{
					cwd: request.workingDirectoryPath,
					stdio: ['ignore', 'pipe', 'pipe'],
					env: {
						...process.env,
						NO_COLOR: '1',
						PAULLETTE_BASE_URL: VERIFICATION_BASE_URL,
						PAULLETTE_MODEL: VERIFICATION_MODEL_NAME,
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
					capabilities: PaulletteRunner.readCapabilities(standardError),
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
					capabilities: PaulletteRunner.readCapabilities(standardError),
				});
			});
		});
	}

	/**
	 * Starts `paullette web`, waits for the address it prints, hands that address to the caller, and stops it.
	 *
	 * The port asked for is zero, so that the operating system picks a free one and two verification runs at the
	 * same time cannot collide. paullette prints the port it really got.
	 *
	 * @param request The folder to run in, what to do once the server answers, and the timeout.
	 * @returns What the run produced, with the standard output holding the address line.
	 */
	static async serve(request: ServeRequest): Promise<ServeOutcome> {
		if (PaulletteRunner.isBuilt() === false) {
			return {
				isBuilt: false,
				isServed: false,
				address: null,
				standardOutput: '',
				standardError: '',
				workingDirectoryPath: request.workingDirectoryPath,
				capabilities: null,
			};
		}

		const timeoutMilliseconds = request.timeoutMilliseconds ?? 240000;

		const childProcess = ChildProcess.spawn(
			'npx',
			[
				'tsx',
				'--conditions=development',
				MAIN_FILE_PATH,
				'web',
				'--port',
				'0',
				...(request.extraArguments ?? []),
			],
			{
				cwd: request.workingDirectoryPath,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: {
					...process.env,
					NO_COLOR: '1',
					PAULLETTE_BASE_URL: VERIFICATION_BASE_URL,
					PAULLETTE_MODEL: VERIFICATION_MODEL_NAME,
				},
			},
		);

		let standardOutput = '';
		let standardError = '';

		childProcess.stdout.on('data', (chunk: Buffer) => {
			standardOutput += chunk.toString('utf8');
		});
		childProcess.stderr.on('data', (chunk: Buffer) => {
			standardError += chunk.toString('utf8');
		});

		const hasExited = new Promise<void>((resolve) => childProcess.on('close', () => resolve()));

		try {
			const address = await PaulletteRunner._waitForAddress(
				() => standardOutput,
				() => childProcess.exitCode !== null,
				timeoutMilliseconds,
			);

			if (address !== null) {
				await request.whileServing(address);
			}

			return {
				isBuilt: true,
				isServed: address !== null,
				address: address,
				standardOutput: standardOutput,
				standardError: standardError,
				workingDirectoryPath: request.workingDirectoryPath,
				capabilities: PaulletteRunner.readCapabilities(standardError),
			};
		} finally {
			childProcess.kill('SIGINT');
			const wasStopped = await Promise.race([
				hasExited.then(() => true),
				new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15000)),
			]);

			if (wasStopped === false) {
				childProcess.kill('SIGKILL');
				await hasExited;
			}
		}
	}

	/**
	 * Reads the capability line paullette writes to its standard error on every run.
	 *
	 * @param standardError Everything paullette wrote to its standard error.
	 * @returns What paullette said it can do, or null when it printed no capability line.
	 */
	static readCapabilities(standardError: string): PaulletteCapabilities | null {
		const capabilityLine = standardError
			.split('\n')
			.reverse()
			.find((line) => line.trim().startsWith(CAPABILITY_LINE_PREFIX) === true);

		if (capabilityLine === undefined) {
			return null;
		}

		const jsonText = capabilityLine.trim().slice(CAPABILITY_LINE_PREFIX.length).trim();
		try {
			return JSON.parse(jsonText) as PaulletteCapabilities;
		} catch {
			return null;
		}
	}

	/**
	 * Waits for the line the web interface writes to its standard output saying where it listens.
	 *
	 * @param readStandardOutput Reads everything written so far.
	 * @param hasExited Says whether the process has already stopped, so that waiting ends instead of timing out.
	 * @param timeoutMilliseconds How long to wait before giving up.
	 * @returns The address, or null when none was printed.
	 */
	private static async _waitForAddress(
		readStandardOutput: () => string,
		hasExited: () => boolean,
		timeoutMilliseconds: number,
	): Promise<string | null> {
		const giveUpAt = Date.now() + timeoutMilliseconds;

		while (Date.now() < giveUpAt) {
			const addressMatch = readStandardOutput().match(/is served at (http:\/\/\S+)/);
			if (addressMatch !== null) {
				return addressMatch[1] ?? null;
			}

			if (hasExited() === true) {
				return null;
			}

			await new Promise((resolve) => setTimeout(resolve, 200));
		}

		return null;
	}

	/**
	 * Says whether the command line entry point of paullette exists yet.
	 *
	 * @returns True when `packages/paullette-cli/src/cli.ts` exists.
	 */
	static isBuilt(): boolean {
		return Fs.existsSync(MAIN_FILE_PATH);
	}

	/**
	 * Says whether paullette rejected an option it does not know about. A verification step treats that as work
	 * still to do rather than as a failure, because the option is part of the plan and not yet written.
	 *
	 * @param outcome What the run produced.
	 * @returns True when paullette complained about an unknown option or an unknown argument.
	 */
	static isOptionUnsupported(outcome: RunOutcome): boolean {
		const combinedOutput = `${outcome.standardOutput}\n${outcome.standardError}`.toLowerCase();
		const unsupportedMarkers = ['unknown option', 'unknown argument', 'unknown command', 'not implemented'];
		return unsupportedMarkers.some((marker) => combinedOutput.includes(marker));
	}

	/**
	 * Makes an empty temporary folder for a run.
	 *
	 * The folder holds no `.git`, so paullette treats the folder itself as the project root, and no `.paullette`,
	 * so a run in it shows whether paullette creates the folder it needs.
	 *
	 * @returns The absolute path of the new folder.
	 */
	static makeEmptyFolder(): string {
		return Fs.mkdtempSync(Path.join(Os.tmpdir(), 'paullette-verify-empty-'));
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
		const folderPath = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'paullette-verify-fixture-'));
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
		if (folderPath.includes('paullette-verify-') === false) {
			throw new Error(`refusing to remove ${folderPath}, which this class did not make`);
		}
		Fs.rmSync(folderPath, {
			recursive: true,
			force: true,
		});
	}
}
