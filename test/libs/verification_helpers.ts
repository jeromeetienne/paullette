import { PaulletteRunner, type RunOutcome } from './paullette_runner.ts';
import {
	VerificationResults,
	type PaulletteCapabilities,
	type ListOutput,
	type VerificationResult,
} from './verification_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerificationHelpers — the reading and reporting shared by every verification check
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////


/**
 * The reading and reporting shared by every verification check.
 */
export class VerificationHelpers {
	/**
	 * Says whether a run shows that the part of paullette being checked does not exist yet.
	 *
	 * This is what keeps a half built repository readable: a check for something not written yet reports PENDING
	 * and says which part is missing, instead of reporting a failure that looks like a bug.
	 *
	 * @param outcome What the run produced.
	 * @param missingPartName The name of the part of paullette the check needs, used in the message.
	 * @returns A pending result when the part is missing, and null when the check can carry on.
	 */
	static pendingWhenNotReady(outcome: RunOutcome, missingPartName: string): VerificationResult | null {
		if (outcome.isBuilt === false) {
			return VerificationResults.pending('packages/paullette-cli/src/cli.ts does not exist yet');
		}

		if (PaulletteRunner.isOptionUnsupported(outcome) === true) {
			return VerificationResults.pending(`${missingPartName} is not built yet`);
		}

		if (outcome.isTimedOut === true) {
			return VerificationResults.failed('paullette did not finish before the timeout ran out');
		}

		return null;
	}

	/**
	 * Says whether paullette lacks the capability a check needs, so that the check reports PENDING rather than a
	 * failure that reads like a bug.
	 *
	 * This also stops a check passing for the wrong reason. The check that a file write is refused would pass on
	 * its own while there is no file writing tool at all, which is a false green of exactly the kind this whole
	 * harness exists to prevent.
	 *
	 * @param outcome What the run produced.
	 * @param isPresent Reads the reported capabilities and says whether the needed part is there.
	 * @param label The name of the needed part, used in the message.
	 * @returns A pending result when the part is missing, and null when the check can carry on.
	 */
	static pendingWhenCapabilityMissing(
		outcome: RunOutcome,
		isPresent: (capabilities: PaulletteCapabilities) => boolean,
		label: string,
	): VerificationResult | null {
		if (outcome.capabilities === null) {
			return VerificationResults.pending('paullette printed no capability line');
		}

		if (isPresent(outcome.capabilities) === false) {
			return VerificationResults.pending(`${label} is not built yet`);
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
	 * @param standardOutput Everything paullette wrote to its standard output.
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
