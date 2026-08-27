import Fs from 'node:fs';
import Path from 'node:path';

import { PaulletteRunner } from './paullette_runner.ts';
import { VerificationHelpers } from './verification_helpers.ts';
import { VerificationResults, type VerificationResult } from './verification_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerificationChecksModel — the checks that call the model
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The checks that call the model.
 *
 * Every one of these is built around a word that exists in exactly one place, so that the word can only reach the
 * answer through the path being checked. PINEAPPLE lives only in `secret_note.txt`, so it proves `read_file` ran.
 * ELDERBERRY lives only inside the secret-keeper subagent, so it proves the subagent ran. This is what stops a
 * model from passing a check by guessing.
 *
 * These checks take minutes rather than seconds, and a failure can mean the model chose badly rather than that
 * the code is wrong. When that happens, rerun against a stronger model and write the difference in `TODO.md`
 * rather than hiding it.
 */
export class VerificationChecksModel {
	/**
	 * Asks the model for one exact word, with no tool involved.
	 *
	 * @returns Whether the answer came back.
	 */
	static async checkOneShotAnswer(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const outcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--print', 'Reply with exactly this one word and nothing else: MARMALADE'],
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the --print option');
			if (pendingResult !== null) {
				return pendingResult;
			}

			if (outcome.standardOutput.toUpperCase().includes('MARMALADE') === false) {
				return VerificationResults.failed(
					'the answer did not hold the word that was asked for',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			return VerificationResults.passed('the model answered through the one-shot mode');
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Holds a whole turn through the web interface: sends a message over a request, reads the answer off the
	 * server-sent events stream, and answers the permission question over a second request while the turn is
	 * parked on it.
	 *
	 * SARDONYX exists nowhere else, so a file on disk holding it proves the message really reached the agent
	 * through the web interface, that the permission question really reached the browser side, and that the
	 * answer to it really released the tool.
	 *
	 * @returns Whether the turn ran to the end and the tool wrote the file.
	 */
	static async checkWebTurnAnswered(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();
		const seen: string[] = [];
		let failure: string | null = null;

		try {
			const outcome = await PaulletteRunner.serve({
				workingDirectoryPath: folderPath,
				timeoutMilliseconds: 90000,
				whileServing: async (address) => {
					const streamResponse = await fetch(`${address}/api/events`);
					if (streamResponse.body === null) {
						failure = 'the server-sent events stream could not be opened';
						return;
					}

					const sendResponse = await fetch(`${address}/api/message`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							message:
								'Write the exact text SARDONYX into a file named web_proof.txt. Then stop.',
						}),
					});
					seen.push(`POST /api/message gave ${sendResponse.status}`);

					if (sendResponse.status !== 202) {
						failure = 'the message was not accepted';
						return;
					}

					failure = await VerificationChecksModel._readWebTurn(address, streamResponse.body, seen);
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

			const proofFilePath = Path.join(folderPath, 'web_proof.txt');
			if (Fs.existsSync(proofFilePath) === false) {
				return VerificationResults.failed('the tool never wrote the file', seen.join('\n'));
			}

			const writtenText = Fs.readFileSync(proofFilePath, 'utf8');
			if (writtenText.toUpperCase().includes('SARDONYX') === false) {
				return VerificationResults.failed(
					`the file holds ${JSON.stringify(writtenText)} rather than the word that was asked for`,
					seen.join('\n'),
				);
			}

			return VerificationResults.passed(
				'a whole turn ran through the web interface, permission and all',
				seen.join('\n'),
			);
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Reads the server-sent events stream of one turn, answering the permission question when it arrives.
	 *
	 * @param address The address the web interface printed.
	 * @param body The stream the browser reads.
	 * @param seen The lines to report when the check fails.
	 * @returns Why the turn did not run to the end, or null when it did.
	 */
	private static async _readWebTurn(
		address: string,
		body: ReadableStream<Uint8Array>,
		seen: string[],
	): Promise<string | null> {
		const reader = body.getReader();
		const textDecoder = new TextDecoder();
		let buffered = '';
		let wasPermissionAsked = false;
		let hasTurnEnded = false;

		while (hasTurnEnded === false) {
			const readResult = await reader.read();
			if (readResult.done === true) {
				break;
			}

			buffered += textDecoder.decode(readResult.value, { stream: true });
			const blocks = buffered.split('\n\n');
			buffered = blocks.pop() ?? '';

			for (const block of blocks) {
				const dataMatch = block.match(/^data: (.+)$/m);
				if (dataMatch === null || dataMatch[1] === undefined) {
					continue;
				}

				const event = JSON.parse(dataMatch[1]) as Record<string, unknown>;
				const kind = String(event['kind']);

				if (kind === 'text') {
					continue;
				}

				seen.push(`event ${kind} ${dataMatch[1].slice(0, 160)}`);

				if (kind === 'permissionRequested') {
					wasPermissionAsked = true;
					const answerResponse = await fetch(`${address}/api/permission`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ identifier: event['identifier'], decision: 'allowed' }),
					});
					seen.push(`POST /api/permission gave ${answerResponse.status}`);
					continue;
				}

				if (kind === 'turnEnded') {
					hasTurnEnded = true;
					break;
				}
			}
		}

		await reader.cancel();

		if (wasPermissionAsked === false) {
			return 'no permission question ever reached the browser side';
		}

		if (hasTurnEnded === false) {
			return 'the turn never ended';
		}

		return null;
	}

	/**
	 * Asks the agent to read a file whose content exists nowhere else, so the answer proves the tool ran.
	 *
	 * @returns Whether the answer held the secret word from the file.
	 */
	static async checkToolCallRead(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const outcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--print', 'Read the file secret_note.txt and tell me the secret word it holds.'],
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the --print option');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const capabilityResult = VerificationHelpers.pendingWhenCapabilityMissing(
				outcome,
				(capabilities) => capabilities.toolNames.includes('read_file') === true,
				'the read_file tool',
			);
			if (capabilityResult !== null) {
				return capabilityResult;
			}

			if (outcome.standardOutput.toUpperCase().includes('PINEAPPLE') === false) {
				return VerificationResults.failed(
					'the answer did not hold the secret word, so read_file did not run or its result was not used',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			return VerificationResults.passed('read_file ran and its result reached the answer');
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Asks the agent to write a file with no terminal and without `--yes`, and checks the file was not written.
	 *
	 * @returns Whether the write was refused.
	 */
	static async checkPermissionRefused(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const outcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--print', 'Create a file named should_not_exist.txt holding the word hello.'],
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the --print option');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const capabilityResult = VerificationHelpers.pendingWhenCapabilityMissing(
				outcome,
				(capabilities) => capabilities.toolNames.includes('write_file') === true,
				'the write_file tool',
			);
			if (capabilityResult !== null) {
				return capabilityResult;
			}

			const writtenFilePath = Path.join(folderPath, 'should_not_exist.txt');
			if (Fs.existsSync(writtenFilePath) === true) {
				return VerificationResults.failed(
					'the file was written even though nothing approved it',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			return VerificationResults.passed('the write was refused and the folder was left alone');
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Asks the agent to write a file with `--yes`, and checks the file appeared.
	 *
	 * @returns Whether the write went through.
	 */
	static async checkPermissionAllowed(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const outcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: [
					'--yes',
					'--print',
					'Create a file named allowed_file.txt holding exactly the word hello.',
				],
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the --yes option');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const capabilityResult = VerificationHelpers.pendingWhenCapabilityMissing(
				outcome,
				(capabilities) => capabilities.toolNames.includes('write_file') === true,
				'the write_file tool',
			);
			if (capabilityResult !== null) {
				return capabilityResult;
			}

			const writtenFilePath = Path.join(folderPath, 'allowed_file.txt');
			if (Fs.existsSync(writtenFilePath) === false) {
				return VerificationResults.failed(
					'the file was not written even though --yes approved it',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			return VerificationResults.passed('the write went through under --yes');
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Asks the agent to remember a fact, then looks at the memory folder.
	 *
	 * @returns Whether a memory file and an index line appeared.
	 */
	static async checkMemoryWritten(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const outcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: [
					'--yes',
					'--print',
					'Remember this for later: the deploy target of this project is Fastly.',
				],
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the memory tools');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const capabilityResult = VerificationHelpers.pendingWhenCapabilityMissing(
				outcome,
				(capabilities) => capabilities.hasMemory === true,
				'the memory store',
			);
			if (capabilityResult !== null) {
				return capabilityResult;
			}

			const memoryFolderPath = Path.join(folderPath, '.paullette', 'memory');
			if (Fs.existsSync(memoryFolderPath) === false) {
				return VerificationResults.failed(
					'the memory folder does not exist',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			const memoryFileNames = Fs.readdirSync(memoryFolderPath).filter((fileName) => {
				return fileName.endsWith('.md') === true && fileName !== 'MEMORY.md';
			});

			if (memoryFileNames.length === 0) {
				return VerificationResults.failed(
					'no memory file was written',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			const indexFilePath = Path.join(memoryFolderPath, 'MEMORY.md');
			const indexText = Fs.existsSync(indexFilePath) === true ? Fs.readFileSync(indexFilePath, 'utf8') : '';
			const isIndexed = memoryFileNames.some((fileName) => indexText.includes(fileName) === true);

			if (isIndexed === false) {
				return VerificationResults.failed(
					`${memoryFileNames.join(', ')} was written but MEMORY.md does not point at it`,
					indexText,
				);
			}

			return VerificationResults.passed(`${memoryFileNames.join(', ')} was written and indexed`);
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Asks for the release codename, which exists only inside the fixture subagent.
	 *
	 * The question is deliberately about something dull. An earlier version asked for a "passphrase", and a
	 * cautious model refused to fetch it on the grounds that passphrases are sensitive, so the check was
	 * measuring the safety posture of the model rather than whether paullette routes to a subagent at all.
	 *
	 * @returns Whether the codename came back, which is only possible if the subagent really ran.
	 */
	static async checkSubagentCalled(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const outcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--print', 'What is the release codename of this project?'],
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the subagent tools');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const capabilityResult = VerificationHelpers.pendingWhenCapabilityMissing(
				outcome,
				(capabilities) => capabilities.toolNames.includes('codename_keeper') === true,
				'the codename-keeper subagent tool',
			);
			if (capabilityResult !== null) {
				return capabilityResult;
			}

			if (outcome.standardOutput.toUpperCase().includes('ELDERBERRY') === false) {
				return VerificationResults.failed(
					'the release codename did not come back, so the codename-keeper subagent did not run',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			return VerificationResults.passed('the codename-keeper subagent ran and its answer reached the user');
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Asks how to greet someone, which only the fixture skill can answer.
	 *
	 * The exact phrase lives only inside `SKILL.md`, so it can only reach the answer if the agent called
	 * `load_skill` and then followed what it read.
	 *
	 * @returns Whether the greeting from the skill came back.
	 */
	static async checkSkillLoaded(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const outcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--print', 'How should I greet someone in this project? Use the project greeting.'],
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the --print option');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const capabilityResult = VerificationHelpers.pendingWhenCapabilityMissing(
				outcome,
				(capabilities) => capabilities.toolNames.includes('load_skill') === true,
				'the load_skill tool',
			);
			if (capabilityResult !== null) {
				return capabilityResult;
			}

			if (outcome.standardOutput.includes('Salutations, friend') === false) {
				return VerificationResults.failed(
					'the greeting from the skill did not come back, so load_skill did not run or was not followed',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			return VerificationResults.passed('load_skill ran and the instructions of the skill were followed');
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Runs one turn, then looks for the session file it should have written.
	 *
	 * @returns Whether a readable session file holding that turn appeared.
	 */
	static async checkSessionSaved(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const outcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--print', 'Remember the number 8675309 for the rest of this conversation.'],
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(outcome, 'the session store');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const capabilityResult = VerificationHelpers.pendingWhenCapabilityMissing(
				outcome,
				(capabilities) => capabilities.hasSessions === true,
				'the session store',
			);
			if (capabilityResult !== null) {
				return capabilityResult;
			}

			const sessionsFolderPath = Path.join(folderPath, '.paullette', 'sessions');
			if (Fs.existsSync(sessionsFolderPath) === false) {
				return VerificationResults.failed(
					'the sessions folder does not exist',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			const sessionFileNames = Fs.readdirSync(sessionsFolderPath).filter((fileName) => {
				return fileName.endsWith('.json') === true;
			});

			if (sessionFileNames.length === 0) {
				return VerificationResults.failed(
					'no session file was written',
					VerificationHelpers.describeOutcome(outcome),
				);
			}

			const sessionFilePath = Path.join(sessionsFolderPath, sessionFileNames[0] as string);
			const sessionText = Fs.readFileSync(sessionFilePath, 'utf8');

			try {
				JSON.parse(sessionText);
			} catch {
				return VerificationResults.failed(
					`${sessionFileNames[0]} is not readable JSON`,
					sessionText.slice(0, 500),
				);
			}

			if (sessionText.includes('8675309') === false) {
				return VerificationResults.failed(
					`${sessionFileNames[0]} does not hold the turn that was just run`,
					sessionText.slice(0, 500),
				);
			}

			return VerificationResults.passed(`${sessionFileNames[0]} holds the turn that was just run`);
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Runs one turn, then runs a second turn with `--resume` that can only be answered from the first turn.
	 *
	 * @returns Whether the second run remembered the first.
	 */
	static async checkSessionResumed(): Promise<VerificationResult> {
		const folderPath = PaulletteRunner.makeFixtureFolder();

		try {
			const firstOutcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--print', 'My favourite number is 8675309. Just say that you noted it.'],
			});

			const pendingResult = VerificationHelpers.pendingWhenNotReady(firstOutcome, 'the session store');
			if (pendingResult !== null) {
				return pendingResult;
			}

			const capabilityResult = VerificationHelpers.pendingWhenCapabilityMissing(
				firstOutcome,
				(capabilities) => capabilities.hasSessions === true,
				'the session store',
			);
			if (capabilityResult !== null) {
				return capabilityResult;
			}

			const secondOutcome = await PaulletteRunner.run({
				workingDirectoryPath: folderPath,
				commandLineArguments: ['--resume', '--print', 'What is my favourite number? Answer with the digits only.'],
			});

			const secondPendingResult = VerificationHelpers.pendingWhenNotReady(secondOutcome, 'the --resume option');
			if (secondPendingResult !== null) {
				return secondPendingResult;
			}

			if (secondOutcome.standardOutput.includes('8675309') === false) {
				return VerificationResults.failed(
					'the second run did not know what the first run was told',
					VerificationHelpers.describeOutcome(secondOutcome),
				);
			}

			return VerificationResults.passed('the second run continued the conversation of the first');
		} finally {
			PaulletteRunner.removeFolder(folderPath);
		}
	}
}
