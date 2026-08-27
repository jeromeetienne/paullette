import { VerificationChecksModel } from './verification_checks_model.ts';
import { VerificationChecksStatic } from './verification_checks_static.ts';
import { type VerificationStep } from './verification_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerificationSteps — the ordered list of checks, matching the plan step by step
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The ordered list of checks. Every entry names the numbered step of the verification section of the plan that it
 * carries out, so that a reader can go from a red line in the scoreboard to the paragraph in GitHub issue number
 * 1 that asked for it.
 */
export class VerificationSteps {
	/**
	 * Builds every verification step, in the order they should run.
	 *
	 * The order matters: the cheap checks that never call the model come first, so that a broken compiler or a
	 * dead endpoint is reported in seconds rather than after several minutes of model calls.
	 *
	 * @returns The list of verification steps.
	 */
	static buildAll(): VerificationStep[] {
		return [
			{
				name: 'typecheck',
				title: 'The TypeScript compiler reports no error',
				planStepNumber: 1,
				isModelNeeded: false,
				run: VerificationChecksStatic.checkTypecheck,
			},
			{
				name: 'endpoint',
				title: 'The endpoint answers and serves the configured model',
				planStepNumber: 2,
				isModelNeeded: false,
				run: VerificationChecksStatic.checkEndpoint,
			},
			{
				name: 'folderCreated',
				title: 'Starting in an empty folder creates .paullette and its subfolders',
				planStepNumber: 3,
				isModelNeeded: false,
				run: VerificationChecksStatic.checkFolderCreated,
			},
			{
				name: 'fixtureLoaded',
				title: 'The fixture instruction document, subagent, command, and skill are all loaded',
				planStepNumber: 4,
				isModelNeeded: false,
				run: VerificationChecksStatic.checkFixtureLoaded,
			},
			{
				name: 'commandExpanded',
				title: 'A slash command expands its arguments, its shell output, and its file reference',
				planStepNumber: 7,
				isModelNeeded: false,
				run: VerificationChecksStatic.checkCommandExpanded,
			},
			{
				name: 'oneShotAnswer',
				title: 'The one-shot mode reaches the model and prints its answer',
				planStepNumber: 5,
				isModelNeeded: true,
				run: VerificationChecksModel.checkOneShotAnswer,
			},
			{
				name: 'toolCallRead',
				title: 'The agent calls read_file and uses what the file said',
				planStepNumber: 5,
				isModelNeeded: true,
				run: VerificationChecksModel.checkToolCallRead,
			},
			{
				name: 'permissionRefused',
				title: 'Without --yes and without a terminal, a file write is refused',
				planStepNumber: 6,
				isModelNeeded: true,
				run: VerificationChecksModel.checkPermissionRefused,
			},
			{
				name: 'permissionAllowed',
				title: 'With --yes, the same file write goes through',
				planStepNumber: 6,
				isModelNeeded: true,
				run: VerificationChecksModel.checkPermissionAllowed,
			},
			{
				name: 'memoryWritten',
				title: 'A remembered fact becomes a memory file and a line in MEMORY.md',
				planStepNumber: 8,
				isModelNeeded: true,
				run: VerificationChecksModel.checkMemoryWritten,
			},
			{
				name: 'subagentCalled',
				title: 'A question only the fixture subagent can answer is answered',
				planStepNumber: 9,
				isModelNeeded: true,
				run: VerificationChecksModel.checkSubagentCalled,
			},
			{
				name: 'skillLoaded',
				title: 'A question only the fixture skill can answer is answered',
				planStepNumber: 9,
				isModelNeeded: true,
				run: VerificationChecksModel.checkSkillLoaded,
			},
			{
				name: 'sessionSaved',
				title: 'The conversation is written to .paullette/sessions',
				planStepNumber: 10,
				isModelNeeded: true,
				run: VerificationChecksModel.checkSessionSaved,
			},
			{
				name: 'sessionResumed',
				title: 'A second run with --resume can use what the first run was told',
				planStepNumber: 10,
				isModelNeeded: true,
				run: VerificationChecksModel.checkSessionResumed,
			},
		];
	}
}
