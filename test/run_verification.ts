import Chalk from 'chalk';

import { VerificationSteps } from './libs/verification_steps.ts';
import { type VerificationOutcome, type VerificationResult, type VerificationStep } from './libs/verification_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	RunVerification — runs every verification step and prints one scoreboard
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The status the whole run exits with when every step passed.
 */
const EXIT_STATUS_EVERYTHING_PASSED = 0;

/**
 * The status the whole run exits with when at least one step failed.
 */
const EXIT_STATUS_SOMETHING_FAILED = 1;

/**
 * The status the whole run exits with when nothing failed but some steps could not run yet.
 */
const EXIT_STATUS_WORK_REMAINING = 2;

/**
 * Written over the progress line so that the result of a step replaces it instead of following it. Spaces are
 * used rather than a terminal control sequence, so that the output stays readable when it is piped to a file.
 */
const CLEAR_LINE = `\r${' '.repeat(100)}\r`;

/**
 * The options the verification runner accepts.
 */
type RunnerOptions = {
	/** The name of the single step to run, or undefined to run every step. */
	onlyStepName: string | undefined;
	/** True to skip every step that calls the model, which leaves only the checks that run in seconds. */
	isFastOnly: boolean;
	/** True to print the raw output a failing step looked at. */
	isDetailWanted: boolean;
};

/**
 * Runs every verification step and prints one scoreboard.
 *
 * This is the single command that answers "is doublure done". A step that passes proves something was really
 * seen; a step that is pending says which part of doublure has still to be written; a step that fails is a fault
 * in code that already exists.
 */
export class RunVerification {
	/**
	 * Runs the verification and exits the process with a status that says what happened.
	 *
	 * @param commandLineArguments The arguments given after the name of the script.
	 * @returns Nothing. This method ends the process.
	 */
	static async main(commandLineArguments: string[]): Promise<void> {
		const options = RunVerification._parseOptions(commandLineArguments);
		const allSteps = VerificationSteps.buildAll();
		const chosenSteps = RunVerification._chooseSteps(allSteps, options);

		if (chosenSteps.length === 0) {
			const knownNames = allSteps.map((step) => step.name).join(', ');
			process.stderr.write(`no step matches --only ${options.onlyStepName}. The names are: ${knownNames}\n`);
			process.exit(EXIT_STATUS_SOMETHING_FAILED);
		}

		process.stdout.write(`\n${Chalk.bold('doublure verification')}  —  ${chosenSteps.length} steps\n\n`);

		const results: Array<{ step: VerificationStep; result: VerificationResult }> = [];

		for (const step of chosenSteps) {
			const isTerminal = process.stdout.isTTY === true;
			if (isTerminal === true) {
				process.stdout.write(`${Chalk.dim('running')} ${step.name} …`);
			}

			let result: VerificationResult;
			try {
				result = await step.run();
			} catch (caughtError) {
				const reason =
					caughtError instanceof Error ? caughtError.stack ?? caughtError.message : String(caughtError);
				result = {
					outcome: 'failed',
					detail: 'the step threw before it could reach a verdict',
					evidence: reason,
				};
			}

			if (isTerminal === true) {
				process.stdout.write(CLEAR_LINE);
			}
			process.stdout.write(RunVerification._formatLine(step, result));
			results.push({
				step: step,
				result: result,
			});
		}

		RunVerification._printSummary(results, options);

		const failedCount = results.filter((entry) => entry.result.outcome === 'failed').length;
		const pendingCount = results.filter((entry) => entry.result.outcome === 'pending').length;

		if (failedCount > 0) {
			process.exit(EXIT_STATUS_SOMETHING_FAILED);
		}
		if (pendingCount > 0) {
			process.exit(EXIT_STATUS_WORK_REMAINING);
		}
		process.exit(EXIT_STATUS_EVERYTHING_PASSED);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads the options out of the command line arguments.
	 *
	 * @param commandLineArguments The arguments given after the name of the script.
	 * @returns The options the runner will use.
	 */
	private static _parseOptions(commandLineArguments: string[]): RunnerOptions {
		const onlyIndex = commandLineArguments.indexOf('--only');
		const onlyStepName = onlyIndex === -1 ? undefined : commandLineArguments[onlyIndex + 1];

		return {
			onlyStepName: onlyStepName,
			isFastOnly: commandLineArguments.includes('--fast'),
			isDetailWanted: commandLineArguments.includes('--detail'),
		};
	}

	/**
	 * Picks the steps to run out of the whole list.
	 *
	 * @param allSteps Every verification step.
	 * @param options The options the runner will use.
	 * @returns The steps to run.
	 */
	private static _chooseSteps(allSteps: VerificationStep[], options: RunnerOptions): VerificationStep[] {
		if (options.onlyStepName !== undefined) {
			return allSteps.filter((step) => step.name === options.onlyStepName);
		}

		if (options.isFastOnly === true) {
			return allSteps.filter((step) => step.isModelNeeded === false);
		}

		return allSteps;
	}

	/**
	 * Builds the one line printed for a finished step.
	 *
	 * @param step The step that ran.
	 * @param result What happened when it ran.
	 * @returns The line to print, ending with a line break.
	 */
	private static _formatLine(step: VerificationStep, result: VerificationResult): string {
		const label = RunVerification._formatOutcome(result.outcome);
		const planReference = Chalk.dim(`plan step ${step.planStepNumber}`);
		return `${label} ${Chalk.bold(step.name.padEnd(20))} ${planReference}  ${result.detail}\n`;
	}

	/**
	 * Colours the word that says what happened.
	 *
	 * @param outcome What happened when the step ran.
	 * @returns The coloured, padded word.
	 */
	private static _formatOutcome(outcome: VerificationOutcome): string {
		if (outcome === 'passed') {
			return Chalk.green('PASS   ');
		}
		if (outcome === 'failed') {
			return Chalk.red('FAIL   ');
		}
		return Chalk.yellow('PENDING');
	}

	/**
	 * Prints the count of each outcome, and the evidence behind every failure.
	 *
	 * @param results Every step and what happened when it ran.
	 * @param options The options the runner used.
	 * @returns Nothing.
	 */
	private static _printSummary(
		results: Array<{ step: VerificationStep; result: VerificationResult }>,
		options: RunnerOptions,
	): void {
		const passedCount = results.filter((entry) => entry.result.outcome === 'passed').length;
		const failedCount = results.filter((entry) => entry.result.outcome === 'failed').length;
		const pendingCount = results.filter((entry) => entry.result.outcome === 'pending').length;

		const passedText = Chalk.green(`${passedCount} passed`);
		const failedText = Chalk.red(`${failedCount} failed`);
		const pendingText = Chalk.yellow(`${pendingCount} pending`);
		process.stdout.write(`\n${passedText}, ${failedText}, ${pendingText}\n`);

		const failedEntries = results.filter((entry) => entry.result.outcome === 'failed');
		for (const entry of failedEntries) {
			process.stdout.write(`\n${Chalk.red(`FAIL ${entry.step.name}`)} — ${entry.step.title}\n`);
			process.stdout.write(`  ${entry.result.detail}\n`);
			if (options.isDetailWanted === true && entry.result.evidence !== undefined) {
				const indentedEvidence = entry.result.evidence
					.split('\n')
					.map((line) => `  ${Chalk.dim(line)}`)
					.join('\n');
				process.stdout.write(`${indentedEvidence}\n`);
			}
		}

		if (failedCount > 0 && options.isDetailWanted === false) {
			process.stdout.write(`\n${Chalk.dim('run again with --detail to see the raw output behind each failure')}\n`);
		}

		if (failedCount === 0 && pendingCount > 0) {
			const message = 'nothing is broken; the pending steps are the work still to do in TODO.md';
			process.stdout.write(`\n${Chalk.dim(message)}\n`);
		}

		if (failedCount === 0 && pendingCount === 0) {
			process.stdout.write(`\n${Chalk.green('every verification step passed')}\n`);
		}

		process.stdout.write('\n');
	}
}

await RunVerification.main(process.argv.slice(2));
