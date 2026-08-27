///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	conversation_turn_types — what a front end is told while one turn runs
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One thing that happened while a turn was running.
 *
 * A front end is given these one at a time, as they happen. The terminal interface reacts to `text` and passes
 * over the rest; the web interface sends every one of them to the browser.
 */
export type ConversationTurnEvent =
	/** One piece of the answer of the model, as it arrives. */
	| {
			kind: 'text';
			/** The piece of the answer. */
			delta: string;
	  }
	/** The model has called a tool. */
	| {
			kind: 'toolCalled';
			/** The name of the tool the model called, or `unknown` when the item does not name one. */
			toolName: string;
	  }
	/** A tool has answered the model. */
	| {
			kind: 'toolOutput';
			/** The name of the tool that answered, or `unknown` when the item does not name one. */
			toolName: string;
	  };

/**
 * Told about each thing that happens while a turn runs.
 */
export type ConversationTurnListener = (event: ConversationTurnEvent) => void;
