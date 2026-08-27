import { DoublureRunner, type RunOutcome } from './doublure_runner.ts';
import { VerificationResults, type ListOutput, type VerificationResult } from './verification_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerificationHelpers — the reading and reporting shared by every verification check
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The base address of the endpoint the verification steps call. It matches the default of doublure itself.
 */
export const VERIFICATION_BASE_URL = process.env['DOUBLURE_BASE_URL'] ?? 'http://127.0.0.1:1234/v1';

/**
 * The model the verification steps call. It matches the default of doublure itself.
 */
export const VERIFICATION_MODEL_NAME = process.env['DOUBLURE_MODEL'] ?? 'google/gemma-4-e2b';

/**
 * The reading and reporting shared by every verification check.
 */
export class VerificationHelpers {
	/**
	 * Says whether a run shows that the part of doublure being checked does not exist yet.
	 *
	 * This is what keeps a half built repository readable: a check for something not written yet reports PENDING
	 * and says which part is missing, instead of reporting a failure that looks like a bug.
	 *
	 * @param outcome What the run produced.
	 * @param missingPartName The name of the part of doublure the check needs, used in the message.
	 * @returns A pending result when the part is missing, and null when the check can carry on.
	 */
	static pendingWhenNotReady(outcome: RunOutcome, missingPartName: string): VerificationResult | null {
		if (outcome.isBuilt === false) {
			return VerificationResults.pending('src/main.ts does not exist yet');
		}

		if (DoublureRunner.isOptionUnsupported(outcome) === true) {
			return VerificationResults.pending(`${missingPartName} is not built yet`);
		}

		if (outcome.isTimedOut === true) {
			return VerificationResults.failed('doublure did not finish before the timeout ran out');
		}

		return null;
	}

	/**
	 * Turns a run into a short block of text a person can read when a check failed.
	 *
	 * @param outcome What the run produced.
	 * @returns The exit status, the standard output, and the standard error, trimmed to a readable size.
	 */
	static describeOutcome(outcome: RunOutcome): string {
		const outputExcerpt = outcome.standardOutput.trim().slice(0, 1500);
		const errorExcerpt = outcome.standardError.trim().slice(0, 1500);
		return [
			`exit status: ${outcome.exitCode}`,
			`standard output:\n${outputExcerpt.length > 0 ? outputExcerpt : '(empty)'}`,
			`standard error:\n${errorExcerpt.length > 0 ? errorExcerpt : '(empty)'}`,
		].join('\n');
	}

	/**
	 * Reads the JSON printed by the `--list` option, ignoring any line printed around it.
	 *
	 * @param standardOutput Everything doublure wrote to its standard output.
	 * @returns The parsed list, or null when no readable JSON object was found.
	 */
	static parseListOutput(standardOutput: string): ListOutput | null {
		const firstBraceIndex = standardOutput.indexOf('{');
		const lastBraceIndex = standardOutput.lastIndexOf('}');
		if (firstBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
			return null;
		}

		try {
			return JSON.parse(standardOutput.slice(firstBraceIndex, lastBraceIndex + 1)) as ListOutput;
		} catch {
			return null;
		}
	}
}
