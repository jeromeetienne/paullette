///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	verification_types — the shapes the verification runner works with
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * What happened when a verification step ran.
 *
 * `passed` and `failed` both mean the step really ran against the code. `pending` means the part of doublure the
 * step checks does not exist yet, so the step could not run at all. A pending step is never a failure, and it is
 * never a pass either: it is work still to do.
 */
export type VerificationOutcome = 'passed' | 'failed' | 'pending';

/**
 * The result of running one verification step.
 */
export type VerificationResult = {
	/** What happened when the step ran. */
	outcome: VerificationOutcome;
	/** One line saying what was seen, printed next to the step in the scoreboard. */
	detail: string;
	/** The raw output the step looked at, printed only when the whole run is asked for detail. */
	evidence?: string;
};

/**
 * One verification step. Each step matches a numbered step of the verification section of the plan, which lives in
 * GitHub issue number 1.
 */
export type VerificationStep = {
	/** The short name used to run this step on its own, with `npm run verify -- --only <name>`. */
	name: string;
	/** The sentence describing what this step proves. */
	title: string;
	/** The number of the matching step in the verification section of the plan. */
	planStepNumber: number;
	/** True when the step calls the model, which makes it slow and makes its result depend on the model. */
	isModelNeeded: boolean;
	/**
	 * Runs the step.
	 *
	 * @returns What happened when the step ran.
	 */
	run: () => Promise<VerificationResult>;
};

/**
 * Builds a result saying the step passed.
 *
 * @param detail One line saying what was seen.
 * @param evidence The raw output the step looked at.
 * @returns The verification result.
 */
export class VerificationResults {
	/**
	 * Builds a result saying the step passed.
	 *
	 * @param detail One line saying what was seen.
	 * @param evidence The raw output the step looked at.
	 * @returns The verification result.
	 */
	static passed(detail: string, evidence?: string): VerificationResult {
		return {
			outcome: 'passed',
			detail: detail,
			evidence: evidence,
		};
	}

	/**
	 * Builds a result saying the step failed.
	 *
	 * @param detail One line saying what was seen.
	 * @param evidence The raw output the step looked at.
	 * @returns The verification result.
	 */
	static failed(detail: string, evidence?: string): VerificationResult {
		return {
			outcome: 'failed',
			detail: detail,
			evidence: evidence,
		};
	}

	/**
	 * Builds a result saying the step could not run because the code it checks does not exist yet.
	 *
	 * @param detail One line saying what is missing.
	 * @param evidence The raw output the step looked at.
	 * @returns The verification result.
	 */
	static pending(detail: string, evidence?: string): VerificationResult {
		return {
			outcome: 'pending',
			detail: detail,
			evidence: evidence,
		};
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	The Contract Of The --list Option
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The shape doublure prints when it is given the `--list` option. This is the contract the implementation has to
 * meet, and it is written down here because the verification steps are the only thing that reads it.
 */
export type ListOutput = {
	/** The folder doublure treated as the project root. */
	projectRootPath: string;
	/** The absolute path of the `.doublure` folder. */
	doublureFolderPath: string;
	/** The instruction document, or null when `.doublure/CLAUDE.md` is absent. */
	instructions: { filePath: string; characterCount: number } | null;
	/** Every subagent read from `.doublure/agents`. */
	agents: Array<{ name: string; description: string; toolNames: string[] | null }>;
	/** Every slash command read from `.doublure/commands`. */
	commands: Array<{ name: string; description: string; argumentHint: string | null }>;
	/** Every skill read from `.doublure/skills`. */
	skills: Array<{ name: string; description: string }>;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	The Capability Line
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The prefix of the line doublure writes to its standard error on every run, saying what it can currently do.
 *
 * This exists so that a check can tell a part that is not built yet from a part that is built and wrong. Without
 * it, a check for the memory tools fails while the memory tools are still unwritten, which reads as a bug and
 * sends a reader off debugging code that does not exist. Worse, a check can pass for the wrong reason: the check
 * that a file write is refused passes on its own while there is no file writing tool at all.
 */
export const CAPABILITY_LINE_PREFIX = 'doublure-capabilities:';

/**
 * What doublure says it can currently do. Written by `src/main.ts` and read by `DoublureRunner`. The two sides
 * are kept in step by hand, because nothing under `test/` may import from `src/`.
 */
export type DoublureCapabilities = {
	/** The names of the tools the agent was given, which is empty until the tools are built. */
	toolNames: string[];
	/** True once doublure reads and writes `.doublure/memory`. */
	hasMemory: boolean;
	/** True once doublure saves the conversation to `.doublure/sessions`. */
	hasSessions: boolean;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	The Endpoint And The Model Under Test
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The base address of the endpoint the verification steps call. It matches the default of doublure itself.
 */
export const VERIFICATION_BASE_URL = process.env['DOUBLURE_BASE_URL'] ?? 'http://127.0.0.1:1234/v1';

/**
 * The model the verification steps call.
 *
 * This is deliberately not the default model of doublure itself. Doublure defaults to `google/gemma-4-e2b`,
 * which answers well and calls a one-argument tool reliably, but cannot reliably produce the four-field JSON
 * object that `memory_write` takes: it emits malformed JSON and the call never reaches the tool. Verifying
 * against it would leave a working feature reported as broken.
 *
 * The verification model is therefore the strongest small model installed here. Set `DOUBLURE_MODEL` to check
 * how a different one copes.
 */
export const VERIFICATION_MODEL_NAME = process.env['DOUBLURE_MODEL'] ?? 'qwen3.5-4b';
