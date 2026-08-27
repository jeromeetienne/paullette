import {
	type PermissionAsker,
	type PermissionDecision,
	type PermissionRequest,
} from 'paullette-core/tools/tool_types';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebPermissionAsker — asks the browser before a tool changes anything
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One permission question waiting for an answer from a browser.
 */
export type WaitingPermission = {
	/** What the answer must name, so that the right waiting tool is released. */
	identifier: string;
	/** What the tool is about to do. */
	request: PermissionRequest;
};

/**
 * Asks the browser whether a tool may do what it is about to do.
 *
 * The promise is parked until an answer arrives over a separate request. That a parked promise can be released
 * from a second request, while the first request is still open and still streaming the turn, was proved live
 * before this was written; the raw output is in the plan on issue 9.
 */
export class WebPermissionAsker implements PermissionAsker {
	/** False when the user asked for every request to be approved without asking, with the `--yes` option. */
	private readonly _isAskingEnabled: boolean;
	/** The tools the user answered "always" for. Remembered for this run only, never written to disk. */
	private readonly _alwaysAllowedToolNames: Set<string>;
	/** Every question waiting for an answer, by identifier. */
	private readonly _waitingPermissions: Map<string, WaitingPermission>;
	/** What each waiting question is parked on. */
	private readonly _waitingResolvers: Map<string, (decision: PermissionDecision) => void>;
	/** How many questions have been asked, which is what the next identifier is built from. */
	private _askedCount: number;
	/** Told as soon as a question starts waiting, so that the server can send it to every browser. */
	private _onWaiting: ((waiting: WaitingPermission) => void) | null;

	/**
	 * Builds the permission asker.
	 *
	 * @param isAskingEnabled False to approve every request without asking, which is what `--yes` does.
	 */
	constructor(isAskingEnabled: boolean) {
		this._isAskingEnabled = isAskingEnabled;
		this._alwaysAllowedToolNames = new Set<string>();
		this._waitingPermissions = new Map<string, WaitingPermission>();
		this._waitingResolvers = new Map<string, (decision: PermissionDecision) => void>();
		this._askedCount = 0;
		this._onWaiting = null;
	}

	/**
	 * The question waiting for an answer, or null when there is none.
	 *
	 * Only one question waits at a time, because only one turn runs at a time and a tool call holds the turn
	 * until it is answered. It is read by a browser that has just connected and has to draw the page.
	 */
	get waitingPermission(): WaitingPermission | null {
		for (const waiting of this._waitingPermissions.values()) {
			return waiting;
		}
		return null;
	}

	/**
	 * Says who to tell when a question starts waiting.
	 *
	 * @param onWaiting Called with the question as soon as it starts waiting, or null to tell nobody.
	 * @returns Nothing.
	 */
	setWaitingListener(onWaiting: ((waiting: WaitingPermission) => void) | null): void {
		this._onWaiting = onWaiting;
	}

	/**
	 * Asks the browser whether a tool may do what it is about to do.
	 *
	 * @param request What the tool is about to do.
	 * @returns Whether the tool may go ahead.
	 */
	async ask(request: PermissionRequest): Promise<PermissionDecision> {
		if (this._isAskingEnabled === false) {
			return 'allowed';
		}

		if (this._alwaysAllowedToolNames.has(request.toolName) === true) {
			return 'allowed';
		}

		this._askedCount += 1;
		const identifier = `permission-${this._askedCount}`;
		const waiting: WaitingPermission = {
			identifier: identifier,
			request: request,
		};

		return await new Promise<PermissionDecision>((resolve) => {
			this._waitingPermissions.set(identifier, waiting);
			this._waitingResolvers.set(identifier, resolve);

			if (this._onWaiting !== null) {
				this._onWaiting(waiting);
			}
		});
	}

	/**
	 * Answers one waiting question, releasing the tool that is parked on it.
	 *
	 * @param identifier The question being answered, taken from the event the browser was sent.
	 * @param decision What the user answered.
	 * @param isAlways True to answer the same way for every later call of the same tool, for this run only.
	 * @returns True when there was such a question waiting, false when there was not.
	 */
	answer(identifier: string, decision: PermissionDecision, isAlways: boolean): boolean {
		const waiting = this._waitingPermissions.get(identifier);
		const resolve = this._waitingResolvers.get(identifier);

		if (waiting === undefined || resolve === undefined) {
			return false;
		}

		if (isAlways === true && decision === 'allowed') {
			this._alwaysAllowedToolNames.add(waiting.request.toolName);
		}

		this._waitingPermissions.delete(identifier);
		this._waitingResolvers.delete(identifier);
		resolve(decision);
		return true;
	}

	/**
	 * Refuses every question still waiting.
	 *
	 * This is what the server calls when it is closing. A tool parked on a promise that is never resolved would
	 * hold the turn, and the turn would hold the process, so the safe direction is to refuse.
	 *
	 * @returns How many questions were refused.
	 */
	refuseEveryWaitingPermission(): number {
		const identifiers = [...this._waitingResolvers.keys()];

		for (const identifier of identifiers) {
			this.answer(identifier, 'refused', false);
		}

		return identifiers.length;
	}
}
