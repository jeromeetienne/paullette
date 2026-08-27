import { type PermissionDecision } from 'paullette-core/tools/tool_types';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	web_types — the shape of every event sent to the browser and of every body it sends back
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One thing that happened in the conversation, written on the server-sent events stream as it happens.
 *
 * Every browser that is connected reads the same events, because one running server holds one conversation.
 */
export type WebEvent =
	/** A turn has begun, carrying the message the user sent. */
	| {
			kind: 'turnStarted';
			/** The message of the user that started this turn. */
			message: string;
	  }
	/** One piece of the answer of the model, as it arrives. */
	| {
			kind: 'text';
			/** The piece of the answer. It is plain text and it is never HTML. */
			delta: string;
	  }
	/** The model has called a tool. */
	| {
			kind: 'toolCalled';
			/** The name of the tool the model called. */
			toolName: string;
	  }
	/** A tool has answered the model. */
	| {
			kind: 'toolOutput';
			/** The name of the tool that answered. */
			toolName: string;
	  }
	/** A tool is waiting for the user to say whether it may go ahead. */
	| {
			kind: 'permissionRequested';
			/** What the answer must be sent back with, so that the right waiting tool is released. */
			identifier: string;
			/** The name of the tool that is asking. */
			toolName: string;
			/** One line saying what is about to happen. */
			summary: string;
			/** The text the user should read before deciding, or null when there is none. */
			detail: string | null;
	  }
	/** A permission question has been answered, so every browser can take the question off the page. */
	| {
			kind: 'permissionAnswered';
			/** The question that was answered. */
			identifier: string;
			/** What the user answered. */
			decision: PermissionDecision;
	  }
	/** The turn is over and the whole answer has been turned into HTML. */
	| {
			kind: 'answerRendered';
			/** The answer of the model as HTML. Nothing the model wrote can be an element in it. */
			html: string;
	  }
	/** The turn is over and the server is ready for the next message. */
	| {
			kind: 'turnEnded';
	  }
	/** Something went wrong during the turn, and the turn is over. */
	| {
			kind: 'error';
			/** What went wrong, in words a person can read. */
			message: string;
	  };

/**
 * The body the browser sends to start one turn.
 */
export type MessageRequestBody = {
	/** The message of the user. */
	message: string;
};

/**
 * The body the browser sends to answer one permission question.
 */
export type PermissionRequestBody = {
	/** The question being answered, taken from the `permissionRequested` event. */
	identifier: string;
	/** What the user answered. */
	decision: PermissionDecision;
};

/**
 * One message of the conversation, as the browser is given it.
 */
export type WebConversationMessage = {
	/** Who said it. */
	role: 'user' | 'assistant';
	/** What was said, as HTML for the model and as plain text for the user. */
	html: string;
};

/**
 * Everything a browser that has just connected needs in order to draw the page.
 */
export type WebState = {
	/** The identifier of the conversation being held. */
	sessionIdentifier: string;
	/** The model the conversation is held with. */
	modelName: string;
	/** The folder the agent reads files from and runs shell commands in. */
	workingDirectoryPath: string;
	/** Everything said so far. */
	messages: WebConversationMessage[];
	/** True while a turn is running, so a second browser does not offer to send a message. */
	isTurnRunning: boolean;
	/** The permission question waiting for an answer, or null when there is none. */
	pendingPermission: {
		identifier: string;
		toolName: string;
		summary: string;
		detail: string | null;
	} | null;
};

/**
 * One past conversation, as the list of sessions gives it.
 */
export type WebSessionSummary = {
	/** The identifier of the session, which is also the name of its file without the extension. */
	identifier: string;
	/** When the session was started. */
	startedAt: string;
	/** The model the conversation was held with. */
	modelName: string;
	/** How many items the conversation holds. */
	itemCount: number;
};
