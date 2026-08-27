import { type PermissionAsker, type PermissionDecision, type PermissionRequest } from '../../../src/tools/tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	FakePermissionAsker — answers every permission request the same way and remembers what was asked
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Answers every permission request the same way and remembers what was asked.
 *
 * A test that checks a tool asks before it changes anything needs both halves: the answer it gives back, and the
 * record of what the tool said it was about to do.
 */
export class FakePermissionAsker implements PermissionAsker {
	/** Every request that was made, in the order it was made. */
	readonly requests: PermissionRequest[] = [];

	/** The answer given to every request. */
	private readonly _decision: PermissionDecision;

	/**
	 * Builds the fake permission asker.
	 *
	 * @param decision The answer to give to every request.
	 */
	constructor(decision: PermissionDecision) {
		this._decision = decision;
	}

	/**
	 * Records the request and answers it with the decision this asker was built with.
	 *
	 * @param request What the tool is about to do.
	 * @returns The decision this asker was built with.
	 */
	async ask(request: PermissionRequest): Promise<PermissionDecision> {
		this.requests.push(request);
		return this._decision;
	}
}
