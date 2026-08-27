import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Path from 'node:path';

import { PaulletteRunner } from './paullette_runner.ts';
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
	 * Starts `paullette web`, and asks it for the page, for its script, for the stylesheet of Bootstrap, for
	 * the state, and for an address that is served by nothing.
	 *
	 * No model is called: none of these five requests starts a turn.
	 *
	 * @returns Whether the web interface listened and answered.
	 */
	static async checkWebInterfaceServed(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();
		const seen: string[] = [];
		let failure: string | null = null;

		try {
			const outcome = await PaulletteRunner.serve({
				workingDirectoryPath: folderPath,
				timeoutMilliseconds: 90000,
				whileServing: async (address) => {
					const page = await fetch(`${address}/`);
					const pageText = await page.text();
					seen.push(`GET / gave ${page.status} ${page.headers.get('content-type')}`);
					if (page.status !== 200 || pageText.includes('<title>paullette</title>') === false) {
						failure = 'the page was not served';
						return;
					}

					const script = await fetch(`${address}/js/chat_page.js`);
					const scriptText = await script.text();
					seen.push(`GET /js/chat_page.js gave ${script.status} ${script.headers.get('content-type')}`);
					if (script.status !== 200 || scriptText.includes('class ChatPage') === false) {
						failure = 'the script of the page was not served';
						return;
					}
					if (scriptText.includes('import type') === true) {
						failure = 'the script of the page still holds TypeScript a browser cannot run';
						return;
					}

					const stylesheet = await fetch(`${address}/vendor/bootstrap/bootstrap.min.css`);
					seen.push(`GET /vendor/bootstrap/bootstrap.min.css gave ${stylesheet.status}`);
					if (stylesheet.status !== 200) {
						failure = 'the stylesheet of Bootstrap was not served off the disk of this machine';
						return;
					}

					const state = await fetch(`${address}/api/state`);
					const stateBody = (await state.json()) as {
						modelName?: string;
						messages?: unknown[];
						isTurnRunning?: boolean;
					};
					seen.push(`GET /api/state gave ${state.status} ${JSON.stringify(stateBody)}`);
					if (state.status !== 200 || stateBody.modelName !== VERIFICATION_MODEL_NAME) {
						failure = 'the state did not name the model paullette is running with';
						return;
					}
					if (Array.isArray(stateBody.messages) === false || stateBody.messages.length !== 0) {
						failure = 'a conversation that has just started should hold no message';
						return;
					}

					const missing = await fetch(`${address}/there-is-nothing-here`);
					seen.push(`GET /there-is-nothing-here gave ${missing.status}`);
					if (missing.status !== 404) {
						failure = 'an address nothing is served at should give a not found';
					}
				},
			});

			if (outcome.isBuilt === false) {
				return VerificationResults.pending('packages/paullette-cli/src/cli.ts does not exist yet');
			}

			if (outcome.capabilities !== null && outcome.capabilities.hasWebInterface !== true) {
				return VerificationResults.pending('the web interface is not built yet');
			}

			if (outcome.isServed === false) {
				return VerificationResults.failed(
					'the web interface printed no address',
					`${outcome.standardOutput}\n${outcome.standardError}`,
				);
			}

			if (failure !== null) {
				return VerificationResults.failed(failure, seen.join('\n'));
			}

			return VerificationResults.passed(`the web interface answered at ${outcome.address}`, seen.join('\n'));
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
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
	 * Starts paullette in an empty folder and looks at what it created.
	 *
	 * @returns Whether the `.paullette` folder and its subfolders appeared.
	 */
	static async checkFolderCreated(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeEmptyFolder();

		try {
			const outcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--list'],
				timeoutMilliseconds: 60000,
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the --list option');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const wantedPaths = [
				'.paullette',
				'.paullette/agents',
				'.paullette/commands',
				'.paullette/skills',
				'.paullette/memory',
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

			return VerificationResults.passed('.paullette and its subfolders were created');
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Starts paullette in the fixture folder and reads back what it loaded.
	 *
	 * @returns Whether the instruction document, the subagent, the command, and the skill were all loaded.
	 */
	static async checkFixtureLoaded(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const outcome = await PaulletteRunner.run({
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
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Expands the fixture slash command without calling the model, and looks for all three kinds of expansion.
	 *
	 * @returns Whether the argument, the shell output, and the file reference were all expanded.
	 */
	static async checkCommandExpanded(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const outcome = await PaulletteRunner.run({
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
			PaulletteRunner.removeFolder(folderPath);
		}
	}
}
