import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';

import {
	CAPABILITY_LINE_PREFIX,
	VERIFICATION_BASE_URL,
	VERIFICATION_MODEL_NAME,
	type CodeAgentCapabilities,
} from './verification_types.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	CodeAgentRunner — starts code-agent without a terminal and captures what it wrote
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The absolute path of the repository root, which is two folders above this file.
 */
const REPOSITORY_ROOT_PATH = Path.resolve(__dirname, '..', '..');

/**
 * The absolute path of the command line entry point of code-agent.
 */
const MAIN_FILE_PATH = Path.join(REPOSITORY_ROOT_PATH, 'src', 'cli.ts');

/**
 * The absolute path of the fixture folder that every verification step starts from.
 */
const FIXTURE_FOLDER_PATH = Path.join(REPOSITORY_ROOT_PATH, 'test', 'fixture');

/**
 * What one run of code-agent produced.
 */
export type RunOutcome = {
	/** False when `src/cli.ts` does not exist yet, which means the step that asked for the run cannot run. */
	isBuilt: boolean;
	/** The status code-agent exited with, or null when it was stopped by the timeout. */
	exitCode: number | null;
	/** Everything code-agent wrote to its standard output, which is the answer of the model. */
	standardOutput: string;
	/** Everything code-agent wrote to its standard error, which is the log of the tool calls. */
	standardError: string;
	/** True when code-agent was still running when the timeout ran out. */
	isTimedOut: boolean;
	/** The folder code-agent ran in, so that a step can look at the files it left behind. */
	workingDirectoryPath: string;
	/** What code-agent said it can currently do, or null when it printed no capability line. */
	capabilities: CodeAgentCapabilities | null;
};

/**
 * The values one run of code-agent needs.
 */
export type RunRequest = {
	/** The folder code-agent runs in, which is also the folder it treats as the project root. */
	workingDirectoryPath: string;
	/** The options and arguments given to code-agent, for example `['--print', 'hello']`. */
	commandLineArguments: string[];
	/** How long to wait before stopping code-agent. A local model needs a generous value here. */
	timeoutMilliseconds?: number;
};

/**
 * Starts code-agent without a terminal and captures what it wrote.
 *
 * Every verification step goes through this class rather than starting code-agent itself, so that there is one
 * place that knows how code-agent is started and one place that decides whether code-agent exists yet.
 */
export class CodeAgentRunner {
	/**
	 * Runs code-agent once and waits for it to exit.
	 *
	 * The standard input is closed, so code-agent sees that there is no terminal. That is what a verification step
	 * relies on when it checks that the permission prompt refuses by default.
	 *
	 * @param request The folder to run in, the command line arguments, and the timeout.
	 * @returns What the run produced.
	 */
	static async run(request: RunRequest): Promise<RunOutcome> {
		if (CodeAgentRunner.isBuilt() === false) {
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
						CODE_AGENT_BASE_URL: VERIFICATION_BASE_URL,
						CODE_AGENT_MODEL: VERIFICATION_MODEL_NAME,
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
					capabilities: CodeAgentRunner.readCapabilities(standardError),
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
					capabilities: CodeAgentRunner.readCapabilities(standardError),
				});
			});
		});
	}

	/**
	 * Reads the capability line code-agent writes to its standard error on every run.
	 *
	 * @param standardError Everything code-agent wrote to its standard error.
	 * @returns What code-agent said it can do, or null when it printed no capability line.
	 */
	static readCapabilities(standardError: string): CodeAgentCapabilities | null {
		const capabilityLine = standardError
			.split('\n')
			.reverse()
			.find((line) => line.trim().startsWith(CAPABILITY_LINE_PREFIX) === true);

		if (capabilityLine === undefined) {
			return null;
		}

		const jsonText = capabilityLine.trim().slice(CAPABILITY_LINE_PREFIX.length).trim();
		try {
			return JSON.parse(jsonText) as CodeAgentCapabilities;
		} catch {
			return null;
		}
	}

	/**
	 * Says whether the command line entry point of code-agent exists yet.
	 *
	 * @returns True when `src/cli.ts` exists.
	 */
	static isBuilt(): boolean {
		return Fs.existsSync(MAIN_FILE_PATH);
	}

	/**
	 * Says whether code-agent rejected an option it does not know about. A verification step treats that as work
	 * still to do rather than as a failure, because the option is part of the plan and not yet written.
	 *
	 * @param outcome What the run produced.
	 * @returns True when code-agent complained about an unknown option or an unknown argument.
	 */
	static isOptionUnsupported(outcome: RunOutcome): boolean {
		const combinedOutput = `${outcome.standardOutput}\n${outcome.standardError}`.toLowerCase();
		const unsupportedMarkers = ['unknown option', 'unknown argument', 'unknown command', 'not implemented'];
		return unsupportedMarkers.some((marker) => combinedOutput.includes(marker));
	}

	/**
	 * Makes an empty temporary folder for a run.
	 *
	 * The folder holds no `.git`, so code-agent treats the folder itself as the project root, and no `.code-agent`,
	 * so a run in it shows whether code-agent creates the folder it needs.
	 *
	 * @returns The absolute path of the new folder.
	 */
	static makeEmptyFolder(): string {
		return Fs.mkdtempSync(Path.join(Os.tmpdir(), 'code-agent-verify-empty-'));
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
		const folderPath = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'code-agent-verify-fixture-'));
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
		if (folderPath.includes('code-agent-verify-') === false) {
			throw new Error(`refusing to remove ${folderPath}, which this class did not make`);
		}
		Fs.rmSync(folderPath, {
			recursive: true,
			force: true,
		});
	}
}
