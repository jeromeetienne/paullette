import Fs from 'node:fs';
import Path from 'node:path';

import { CodeAgentRunner } from './code_agent_runner.ts';
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
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const outcome = await CodeAgentRunner.run({
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
			CodeAgentRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Asks the agent to read a file whose content exists nowhere else, so the answer proves the tool ran.
	 *
	 * @returns Whether the answer held the secret word from the file.
	 */
	static async checkToolCallRead(): Promise<VerificationResult> {
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const outcome = await CodeAgentRunner.run({
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
			CodeAgentRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Asks the agent to write a file with no terminal and without `--yes`, and checks the file was not written.
	 *
	 * @returns Whether the write was refused.
	 */
	static async checkPermissionRefused(): Promise<VerificationResult> {
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const outcome = await CodeAgentRunner.run({
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
			CodeAgentRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Asks the agent to write a file with `--yes`, and checks the file appeared.
	 *
	 * @returns Whether the write went through.
	 */
	static async checkPermissionAllowed(): Promise<VerificationResult> {
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const outcome = await CodeAgentRunner.run({
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
			CodeAgentRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Asks the agent to remember a fact, then looks at the memory folder.
	 *
	 * @returns Whether a memory file and an index line appeared.
	 */
	static async checkMemoryWritten(): Promise<VerificationResult> {
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const outcome = await CodeAgentRunner.run({
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

			const memoryFolderPath = Path.join(folderPath, '.code-agent', 'memory');
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
			CodeAgentRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Asks for the release codename, which exists only inside the fixture subagent.
	 *
	 * The question is deliberately about something dull. An earlier version asked for a "passphrase", and a
	 * cautious model refused to fetch it on the grounds that passphrases are sensitive, so the check was
	 * measuring the safety posture of the model rather than whether code-agent routes to a subagent at all.
	 *
	 * @returns Whether the codename came back, which is only possible if the subagent really ran.
	 */
	static async checkSubagentCalled(): Promise<VerificationResult> {
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const outcome = await CodeAgentRunner.run({
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
			CodeAgentRunner.removeFolder(folderPath);
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
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const outcome = await CodeAgentRunner.run({
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
			CodeAgentRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Runs one turn, then looks for the session file it should have written.
	 *
	 * @returns Whether a readable session file holding that turn appeared.
	 */
	static async checkSessionSaved(): Promise<VerificationResult> {
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const outcome = await CodeAgentRunner.run({
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

			const sessionsFolderPath = Path.join(folderPath, '.code-agent', 'sessions');
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
			CodeAgentRunner.removeFolder(folderPath);
		}
	}

	/**
	 * Runs one turn, then runs a second turn with `--resume` that can only be answered from the first turn.
	 *
	 * @returns Whether the second run remembered the first.
	 */
	static async checkSessionResumed(): Promise<VerificationResult> {
		const folderPath = CodeAgentRunner.makeFixtureFolder();

		try {
			const firstOutcome = await CodeAgentRunner.run({
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

			const secondOutcome = await CodeAgentRunner.run({
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
			CodeAgentRunner.removeFolder(folderPath);
		}
	}
}
