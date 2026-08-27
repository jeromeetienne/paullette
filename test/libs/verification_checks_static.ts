import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Path from 'node:path';

import { CodeAgentRunner } from './code_agent_runner.ts';
import { EndpointProbe } from './endpoint_probe.ts';
import { VerificationHelpers } from './verification_helpers.ts';
import {
	VERIFICATION_BASE_URL,
	VERIFICATION_MODEL_NAME,
	VerificationResults,
	type VerificationResult,
} from './verification_types.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerificationChecksStatic — the checks that never call the model
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The absolute path of the repository root, which is two folders above this file.
 */
const REPOSITORY_ROOT_PATH = Path.resolve(__dirname, '..', '..');

/**
 * The checks that never call the model. They run in seconds rather than in minutes, and their result never
 * depends on how well a small model picks its tools, so a failure here is always a real fault in the code.
 */
export class VerificationChecksStatic {
	/**
	 * Runs the TypeScript compiler over the repository.
	 *
	 * @returns Whether the compiler reported an error.
	 */
	static async checkTypecheck(): Promise<VerificationResult> {
		const compilerRun = ChildProcess.spawnSync('npx', ['tsc', '--noEmit'], {
			cwd: REPOSITORY_ROOT_PATH,
			encoding: 'utf8',
			timeout: 180000,
		});

		const combinedOutput = `${compilerRun.stdout ?? ''}${compilerRun.stderr ?? ''}`.trim();

		if (compilerRun.status === 0) {
			return VerificationResults.passed('the compiler reported no error');
		}

		const firstLine = combinedOutput.split('\n')[0] ?? 'no output';
		return VerificationResults.failed(firstLine, combinedOutput);
	}

	/**
	 * Asks the endpoint for its model list.
	 *
	 * This runs before every check that calls the model, because a dead endpoint makes all of those fail at once
	 * in a way that says nothing about the code.
	 *
	 * @returns Whether the endpoint answered and served the configured model.
	 */
	static async checkEndpoint(): Promise<VerificationResult> {
		const status = await EndpointProbe.check(VERIFICATION_BASE_URL, VERIFICATION_MODEL_NAME);

		if (status.isReachable === false) {
			return VerificationResults.failed(status.failureReason ?? 'the endpoint could not be reached');
		}

		if (status.isModelPresent === false) {
			return VerificationResults.failed(
				`${VERIFICATION_MODEL_NAME} is not served; the endpoint offers ${status.modelNames.join(', ')}`,
			);
		}

		return VerificationResults.passed(`${VERIFICATION_BASE_URL} serves ${VERIFICATION_MODEL_NAME}`);
	}

	/**
	 * Starts code-agent in an empty folder and looks at what it created.
	 *
	 * @returns Whether the `.code-agent` folder and its subfolders appeared.
	 */
	static async checkFolderCreated(): Promise<VerificationResult> {
		const folderPath = CodeAgentRunner.makeEmptyFolder();

		try {
			const outcome = await CodeAgentRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--list'],
				timeoutMilliseconds: 60000,
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the --list option');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const wantedPaths = [
				'.code-agent',
				'.code-agent/agents',
				'.code-agent/commands',
				'.code-agent/skills',
				'.code-agent/memory',
			];
			const missingPaths = wantedPaths.filter((wantedPath) => {
				return Fs.existsSync(Path.join(folderPath, wantedPath)) === false;
			});

			if (missingPaths.length > 0) {
				return VerificationResults.failed(
					`these were not created: ${missingPaths.join(', ')}`,
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			return VerificationResults.passed('.code-agent and its subfolders were created');
		} finally {
			CodeAgentRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Starts code-agent in the fixture folder and reads back what it loaded.
	 *
	 * @returns Whether the instruction document, the subagent, the command, and the skill were all loaded.
	 */
	static async checkFixtureLoaded(): Promise<VerificationResult> {
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const outcome = await CodeAgentRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--list'],
				timeoutMilliseconds: 60000,
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the --list option');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const listOutput = VerificationHelpers.parseListOutput(outcome.standardOutput);
			if (listOutput === null) {
				return VerificationResults.failed(
					'the --list option did not print readable JSON',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			const complaints: string[] = [];
			if (listOutput.instructions === null || listOutput.instructions.characterCount === 0) {
				complaints.push('the instruction document was not loaded');
			}
			if (listOutput.agents.some((agent) => agent.name === 'codename-keeper') === false) {
				complaints.push('the codename-keeper subagent was not loaded');
			}
			if (listOutput.commands.some((command) => command.name === 'greet') === false) {
				complaints.push('the greet command was not loaded');
			}
			if (listOutput.skills.some((skill) => skill.name === 'greeting-style') === false) {
				complaints.push('the greeting-style skill was not loaded');
			}

			if (complaints.length > 0) {
				return VerificationResults.failed(complaints.join('; '), outcome.standardOutput);
			}

			return VerificationResults.passed('the instruction document, the subagent, the command, and the skill were loaded');
		} finally {
			CodeAgentRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Expands the fixture slash command without calling the model, and looks for all three kinds of expansion.
	 *
	 * @returns Whether the argument, the shell output, and the file reference were all expanded.
	 */
	static async checkCommandExpanded(): Promise<VerificationResult> {
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const outcome = await CodeAgentRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--yes', '--expand', '/greet World'],
				timeoutMilliseconds: 60000,
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the --expand option');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const expandedText = outcome.standardOutput;
			const complaints: string[] = [];
			if (expandedText.includes('World') === false) {
				complaints.push('$ARGUMENTS was not replaced');
			}
			if (expandedText.includes('secret_note.txt') === false) {
				complaints.push('the shell command output is missing the folder listing');
			}
			if (expandedText.includes('PINEAPPLE') === false) {
				complaints.push('the @secret_note.txt reference was not replaced by the content of the file');
			}

			if (complaints.length > 0) {
				return VerificationResults.failed(complaints.join('; '), VerificationHelpers.describeOutcome(outcome));
			}

			return VerificationResults.passed('the argument, the shell output, and the file reference were all expanded');
		} finally {
			CodeAgentRunner.removeFolder(folderPath);
		}
	}
}
