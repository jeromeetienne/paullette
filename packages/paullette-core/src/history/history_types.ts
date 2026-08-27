import { type RunResult } from '@openai/agents';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	history_types — the shape of a conversation saved to disk
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One item of a conversation, as the OpenAI Agents SDK hands it back.
 *
 * The type is taken from `RunResult` rather than written out here, so that it cannot drift from what the SDK
 * actually produces. The SDK does not export the item type from its root, and reaching into the inside of the
 * package to get it would break the next time the package is rearranged.
 */
export type ConversationHistoryItem = InstanceType<typeof RunResult>['history'][number];

/**
 * A whole conversation as it is written to `.paullette/sessions`.
 *
 * This is plain readable JSON on purpose. A person should be able to open a session file, see what was said, and
 * delete it, without paullette being involved.
 */
export type StoredSession = {
	/** The name of the session, which is also the name of its file without the extension. */
	identifier: string;
	/** When the session was started, as an ISO timestamp. */
	startedAt: string;
	/** When the session was last written, as an ISO timestamp. */
	updatedAt: string;
	/** The model the conversation was held with, recorded so that a resumed session says where it came from. */
	modelName: string;
	/** Everything said so far, which is what is handed back to the model when the session is resumed. */
	history: ConversationHistoryItem[];
};

/**
 * One saved conversation, without what was said in it.
 *
 * A list of every session on disk is read to show a person what is there. Reading the whole conversation of
 * every session in order to show a list of them would read every byte of every file to show none of it.
 */
export type StoredSessionSummary = {
	/** The name of the session, which is also the name of its file without the extension. */
	identifier: string;
	/** When the session was started, as an ISO timestamp. */
	startedAt: string;
	/** When the session was last written, as an ISO timestamp. */
	updatedAt: string;
	/** The model the conversation was held with. */
	modelName: string;
	/** How many items the conversation holds. */
	itemCount: number;
};
