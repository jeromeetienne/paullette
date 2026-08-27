import type {
	PermissionRequestBody,
	WebConversationMessage,
	WebEvent,
	WebPermissionQuestion,
	WebSessionListBody,
	WebSessionMessagesBody,
	WebState,
} from '../../../src/server/web_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ChatPage — the script of the paullette web interface, run in the browser
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The one page of the paullette web interface.
 *
 * Everything this page shows about a turn arrives over one server-sent events stream at `/api/events`, and
 * everything the page has to say goes back in an ordinary request. The shapes of both are the ones the server
 * declares in `src/server/web_types.ts`, imported here as types only, so that the two sides cannot drift apart.
 *
 * Every element built here is given Bootstrap classes, which is where everything the page looks like comes
 * from. The three rules of `css/chat_page.css` are the whole of what is written by hand, and each one says why.
 */
class ChatPage {
	/** The element every message and every tool line is added to. */
	private readonly _conversationElement: HTMLElement;
	/** The sentence shown while nothing has been said yet, or null once something has. */
	private _emptyNoteElement: HTMLElement | null;
	/** The card holding the permission question, hidden while there is none. */
	private readonly _permissionElement: HTMLElement;
	/** The one line saying what is about to happen. */
	private readonly _permissionSummaryElement: HTMLElement;
	/** The text to read before deciding, hidden when the question carries none. */
	private readonly _permissionDetailElement: HTMLElement;
	/** The button that allows the waiting tool this once. */
	private readonly _allowButton: HTMLButtonElement;
	/** The button that allows the waiting tool for the rest of this run. */
	private readonly _alwaysButton: HTMLButtonElement;
	/** The button that refuses the waiting tool. */
	private readonly _refuseButton: HTMLButtonElement;
	/** The form the message is typed into. */
	private readonly _composerElement: HTMLFormElement;
	/** The box the message is typed into. */
	private readonly _messageElement: HTMLTextAreaElement;
	/** The button that sends the message. */
	private readonly _sendButton: HTMLButtonElement;
	/** The line under the composer, where what is happening is written. */
	private readonly _statusElement: HTMLElement;
	/** The button that opens the past conversations. */
	private readonly _sessionsButton: HTMLButtonElement;
	/** The window the past conversations are shown in. */
	private readonly _sessionsDialog: HTMLDialogElement;
	/** The list of past conversations inside that window. */
	private readonly _sessionsListElement: HTMLElement;
	/** The one past conversation being read inside that window. */
	private readonly _sessionsShownElement: HTMLElement;
	/** The button that closes that window. */
	private readonly _sessionsCloseButton: HTMLButtonElement;
	/** The name of the model, in the header. */
	private readonly _modelNameElement: HTMLElement;
	/** The folder the agent works in, in the header. */
	private readonly _workingDirectoryPathElement: HTMLElement;
	/** The identifier of the conversation being held, in the header. */
	private readonly _sessionIdentifierElement: HTMLElement;
	/** The stream every event arrives on. */
	private readonly _eventSource: EventSource;
	/** The element the answer is being written into while the turn runs, or null between turns. */
	private _streamingElement: HTMLElement | null;
	/** The identifier of the permission question on the screen, or null when there is none. */
	private _waitingPermissionIdentifier: string | null;
	/** True while a turn is running. */
	private _isTurnRunning: boolean;

	/**
	 * Finds every element of the page and opens the stream. Nothing is listened to until `listen` is called.
	 */
	constructor() {
		this._conversationElement = ChatPage._element('conversation');
		this._emptyNoteElement = document.getElementById('empty-note');
		this._permissionElement = ChatPage._element('permission');
		this._permissionSummaryElement = ChatPage._element('permission-summary');
		this._permissionDetailElement = ChatPage._element('permission-detail');
		this._allowButton = ChatPage._element<HTMLButtonElement>('permission-allow');
		this._alwaysButton = ChatPage._element<HTMLButtonElement>('permission-always');
		this._refuseButton = ChatPage._element<HTMLButtonElement>('permission-refuse');
		this._composerElement = ChatPage._element<HTMLFormElement>('composer');
		this._messageElement = ChatPage._element<HTMLTextAreaElement>('message');
		this._sendButton = ChatPage._element<HTMLButtonElement>('send-button');
		this._statusElement = ChatPage._element('status');
		this._sessionsButton = ChatPage._element<HTMLButtonElement>('sessions-button');
		this._sessionsDialog = ChatPage._element<HTMLDialogElement>('sessions-dialog');
		this._sessionsListElement = ChatPage._element('sessions-list');
		this._sessionsShownElement = ChatPage._element('sessions-shown');
		this._sessionsCloseButton = ChatPage._element<HTMLButtonElement>('sessions-close');
		this._modelNameElement = ChatPage._element('model-name');
		this._workingDirectoryPathElement = ChatPage._element('working-directory-path');
		this._sessionIdentifierElement = ChatPage._element('session-identifier');

		this._eventSource = new EventSource('/api/events');
		this._streamingElement = null;
		this._waitingPermissionIdentifier = null;
		this._isTurnRunning = false;
	}

	/**
	 * Builds the page and starts it. It is the one thing the browser calls.
	 *
	 * @returns Nothing.
	 */
	static start(): void {
		const chatPage = new ChatPage();
		chatPage.listen();
	}

	/**
	 * Listens to every button, to the composer, and to the stream, then reads the state of the conversation.
	 *
	 * @returns Nothing.
	 */
	listen(): void {
		this._listenToThePermissionButtons();
		this._listenToTheComposer();
		this._listenToThePastConversations();
		this._listenToTheStream();

		void this._readState();
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Drawing The Conversation
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Writes one line under the composer, saying what is happening or what went wrong.
	 *
	 * @param text What to write. An empty text clears the line.
	 * @param isError True when what happened is a failure, which is written in the colour of a failure.
	 * @returns Nothing.
	 */
	private _writeStatus(text: string, isError: boolean): void {
		this._statusElement.textContent = text;
		this._statusElement.classList.toggle('text-danger', isError === true);
		this._statusElement.classList.toggle('text-body-secondary', isError === false);
	}

	/**
	 * Takes the sentence shown while nothing has been said yet off the page, the first time something is said.
	 *
	 * @returns Nothing.
	 */
	private _hideEmptyNote(): void {
		if (this._emptyNoteElement !== null && this._emptyNoteElement.parentNode !== null) {
			this._emptyNoteElement.parentNode.removeChild(this._emptyNoteElement);
			this._emptyNoteElement = null;
		}
	}

	/**
	 * Scrolls to the newest thing on the page.
	 *
	 * @returns Nothing.
	 */
	private _scrollToBottom(): void {
		window.scrollTo(0, document.body.scrollHeight);
	}

	/**
	 * Adds one message to the page.
	 *
	 * The HTML always comes from the server, which has already made sure that nothing the model wrote can be an
	 * element. The page never builds HTML out of text itself.
	 *
	 * @param role Who said it.
	 * @param html What was said, as HTML for the model and as plain text for the user.
	 * @param parentElement Where to add it. The conversation itself when nothing else is named.
	 * @returns The element the words of the message are in, so that the caller can go on writing into it.
	 */
	private _addMessage(
		role: WebConversationMessage['role'],
		html: string,
		parentElement?: HTMLElement,
	): HTMLElement {
		this._hideEmptyNote();

		const messageElement = document.createElement('article');
		messageElement.className = 'row g-2';

		const whoElement = document.createElement('div');
		whoElement.className =
			'col-3 col-sm-2 small text-uppercase ' + (role === 'user' ? 'text-primary' : 'text-body-secondary');
		whoElement.textContent = role === 'user' ? 'you' : 'paullette';

		const bodyElement = document.createElement('div');
		bodyElement.className = 'col message-body text-break';
		bodyElement.innerHTML = html;

		messageElement.appendChild(whoElement);
		messageElement.appendChild(bodyElement);
		(parentElement === undefined ? this._conversationElement : parentElement).appendChild(messageElement);

		return bodyElement;
	}

	/**
	 * Adds one line about a tool to the conversation.
	 *
	 * @param text The line to add.
	 * @returns Nothing.
	 */
	private _addToolLine(text: string): void {
		this._hideEmptyNote();

		const lineElement = document.createElement('div');
		lineElement.className = 'font-monospace small text-warning-emphasis';
		lineElement.textContent = text;
		this._conversationElement.appendChild(lineElement);
		this._scrollToBottom();
	}

	/**
	 * Opens an empty answer the pieces of the answer are written into as they arrive.
	 *
	 * @returns Nothing.
	 */
	private _startStreamingAnswer(): void {
		this._streamingElement = this._addMessage('assistant', '');
		this._streamingElement.classList.add('streaming');
	}

	/**
	 * Lets the user send a message, or stops them while a turn is running.
	 *
	 * @param isEnabled True when a message may be sent.
	 * @returns Nothing.
	 */
	private _setSendingEnabled(isEnabled: boolean): void {
		this._isTurnRunning = isEnabled === false;
		this._sendButton.disabled = isEnabled === false;
		this._messageElement.disabled = isEnabled === false;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Permission Question
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Listens to the three buttons that answer a permission question.
	 *
	 * @returns Nothing.
	 */
	private _listenToThePermissionButtons(): void {
		this._allowButton.addEventListener('click', () => {
			void this._answerPermission('allowed', false);
		});
		this._alwaysButton.addEventListener('click', () => {
			void this._answerPermission('allowed', true);
		});
		this._refuseButton.addEventListener('click', () => {
			void this._answerPermission('refused', false);
		});
	}

	/**
	 * Puts a permission question on the screen and moves the focus to the button that allows it.
	 *
	 * @param question The question waiting for an answer.
	 * @returns Nothing.
	 */
	private _showPermission(question: WebPermissionQuestion): void {
		this._waitingPermissionIdentifier = question.identifier;
		this._permissionSummaryElement.textContent = question.summary;
		this._alwaysButton.textContent = `always allow ${question.toolName}`;

		if (question.detail !== null && question.detail.length > 0) {
			this._permissionDetailElement.textContent = question.detail;
			this._permissionDetailElement.hidden = false;
		} else {
			this._permissionDetailElement.textContent = '';
			this._permissionDetailElement.hidden = true;
		}

		this._permissionElement.hidden = false;
		this._allowButton.focus();
	}

	/**
	 * Takes the permission question off the screen.
	 *
	 * @returns Nothing.
	 */
	private _hidePermission(): void {
		this._waitingPermissionIdentifier = null;
		this._permissionElement.hidden = true;
	}

	/**
	 * Sends the answer to the question on the screen, which releases the tool parked on it.
	 *
	 * @param decision What the user answered.
	 * @param isAlways True when the tool may go ahead for the rest of this run without asking again.
	 * @returns Nothing.
	 */
	private async _answerPermission(
		decision: PermissionRequestBody['decision'],
		isAlways: boolean,
	): Promise<void> {
		if (this._waitingPermissionIdentifier === null) {
			return;
		}

		const body: PermissionRequestBody = {
			identifier: this._waitingPermissionIdentifier,
			decision: decision,
			isAlways: isAlways,
		};
		this._hidePermission();

		try {
			await fetch('/api/permission', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify(body),
			});
		} catch (caughtError) {
			this._writeStatus(`The answer did not reach paullette: ${ChatPage._reasonOf(caughtError)}`, true);
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Sending A Message
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Listens to the composer: the send button, and the Enter key without Shift.
	 *
	 * @returns Nothing.
	 */
	private _listenToTheComposer(): void {
		this._composerElement.addEventListener('submit', (submitEvent) => {
			submitEvent.preventDefault();
			void this._sendMessage();
		});

		this._messageElement.addEventListener('keydown', (keyboardEvent) => {
			if (keyboardEvent.key === 'Enter' && keyboardEvent.shiftKey === false) {
				keyboardEvent.preventDefault();
				void this._sendMessage();
			}
		});
	}

	/**
	 * Sends what was typed and starts one turn. What happens next arrives on the stream, not in this answer.
	 *
	 * @returns Nothing.
	 */
	private async _sendMessage(): Promise<void> {
		const text = this._messageElement.value;
		if (text.trim().length === 0 || this._isTurnRunning === true) {
			return;
		}

		this._messageElement.value = '';
		this._setSendingEnabled(false);
		this._writeStatus('paullette is thinking…', false);

		try {
			const answer = await fetch('/api/message', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					message: text,
				}),
			});

			if (answer.ok === true) {
				return;
			}

			const body = (await answer.json()) as { error?: string };
			this._setSendingEnabled(true);
			this._writeStatus(body.error === undefined ? 'The message was refused.' : body.error, true);
			this._messageElement.value = text;
		} catch (caughtError) {
			this._setSendingEnabled(true);
			this._writeStatus(`The message did not reach paullette: ${ChatPage._reasonOf(caughtError)}`, true);
			this._messageElement.value = text;
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Past Conversations
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Listens to the button that opens the past conversations and to the one that closes them.
	 *
	 * @returns Nothing.
	 */
	private _listenToThePastConversations(): void {
		this._sessionsButton.addEventListener('click', () => {
			void this._showPastConversations();
		});

		this._sessionsCloseButton.addEventListener('click', () => {
			this._sessionsDialog.close();
		});
	}

	/**
	 * Opens the window of past conversations and fills it with the list the server holds.
	 *
	 * @returns Nothing.
	 */
	private async _showPastConversations(): Promise<void> {
		this._sessionsShownElement.hidden = true;
		this._sessionsShownElement.innerHTML = '';
		this._sessionsListElement.innerHTML = '';
		this._sessionsDialog.showModal();

		const answer = await fetch('/api/sessions');
		const body = (await answer.json()) as WebSessionListBody;

		if (body.sessions === undefined || body.sessions.length === 0) {
			const emptyItem = document.createElement('li');
			emptyItem.className = 'list-group-item text-body-secondary';
			emptyItem.textContent = 'There is no saved conversation yet.';
			this._sessionsListElement.appendChild(emptyItem);
			return;
		}

		for (const session of body.sessions) {
			const listItem = document.createElement('li');
			listItem.className = 'list-group-item p-0';

			const openButton = document.createElement('button');
			openButton.type = 'button';
			openButton.className = 'btn btn-link text-body text-decoration-none text-start w-100 py-2';

			const whenElement = document.createElement('div');
			whenElement.className = 'font-monospace';
			whenElement.textContent = session.startedAt;

			const aboutElement = document.createElement('div');
			aboutElement.className = 'small text-body-secondary';
			aboutElement.textContent = `${session.modelName} — ${session.itemCount} items`;

			openButton.appendChild(whenElement);
			openButton.appendChild(aboutElement);
			openButton.addEventListener('click', () => {
				void this._showOnePastConversation(session.identifier);
			});

			listItem.appendChild(openButton);
			this._sessionsListElement.appendChild(listItem);
		}
	}

	/**
	 * Reads one past conversation and shows it inside the window of past conversations.
	 *
	 * @param identifier The conversation to read.
	 * @returns Nothing.
	 */
	private async _showOnePastConversation(identifier: string): Promise<void> {
		try {
			const answer = await fetch(`/api/sessions/${encodeURIComponent(identifier)}`);
			const body = (await answer.json()) as WebSessionMessagesBody;

			this._sessionsShownElement.innerHTML = '';
			this._sessionsShownElement.hidden = false;

			if (body.messages === undefined || body.messages.length === 0) {
				this._sessionsShownElement.textContent = 'Nothing was said in that conversation.';
				return;
			}

			for (const message of body.messages) {
				this._addMessage(message.role, message.html, this._sessionsShownElement);
			}
		} catch (caughtError) {
			this._sessionsShownElement.hidden = false;
			this._sessionsShownElement.textContent = `That conversation could not be read: ${ChatPage._reasonOf(
				caughtError,
			)}`;
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Stream
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads the whole state of the conversation and draws the page from it.
	 *
	 * @returns Nothing.
	 */
	private async _readState(): Promise<void> {
		try {
			const answer = await fetch('/api/state');
			const state = (await answer.json()) as WebState;

			this._modelNameElement.textContent = state.modelName;
			this._workingDirectoryPathElement.textContent = state.workingDirectoryPath;
			this._sessionIdentifierElement.textContent = state.sessionIdentifier;
			document.title = `paullette — ${state.modelName}`;

			this._conversationElement.innerHTML = '';
			this._emptyNoteElement = null;

			for (const message of state.messages) {
				this._addMessage(message.role, message.html);
			}

			if (state.messages.length === 0) {
				const noteElement = document.createElement('p');
				noteElement.className = 'm-0 fst-italic text-body-secondary';
				noteElement.textContent = 'Ask paullette something.';
				this._conversationElement.appendChild(noteElement);
				this._emptyNoteElement = noteElement;
			}

			this._setSendingEnabled(state.isTurnRunning === false);

			if (state.pendingPermission !== null) {
				this._showPermission(state.pendingPermission);
			}
		} catch (caughtError) {
			this._writeStatus(`paullette could not be reached: ${ChatPage._reasonOf(caughtError)}`, true);
		}
	}

	/**
	 * Listens to every event the server writes on the stream.
	 *
	 * @returns Nothing.
	 */
	private _listenToTheStream(): void {
		this._listenFor('turnStarted', (event) => {
			const bodyElement = this._addMessage('user', '');
			bodyElement.textContent = event.message;
			this._setSendingEnabled(false);
			this._writeStatus('paullette is thinking…', false);
			this._streamingElement = null;
			this._scrollToBottom();
		});

		this._listenFor('text', (event) => {
			if (this._streamingElement === null) {
				this._startStreamingAnswer();
			}
			if (this._streamingElement !== null) {
				this._streamingElement.textContent += event.delta;
			}
			this._scrollToBottom();
		});

		this._listenFor('toolCalled', (event) => {
			this._addToolLine(`→ ${event.toolName}`);
		});

		this._listenFor('toolOutput', (event) => {
			this._addToolLine(`← ${event.toolName}`);
		});

		this._listenFor('permissionRequested', (event) => {
			this._showPermission(event);
		});

		this._listenFor('permissionAnswered', (event) => {
			if (this._waitingPermissionIdentifier === event.identifier) {
				this._hidePermission();
			}
			this._addToolLine(`· ${event.decision}`);
		});

		this._listenFor('answerRendered', (event) => {
			if (this._streamingElement === null) {
				this._startStreamingAnswer();
			}
			if (this._streamingElement !== null) {
				this._streamingElement.classList.remove('streaming');
				this._streamingElement.innerHTML = event.html;
			}
			this._streamingElement = null;
			this._scrollToBottom();
		});

		this._listenFor('turnEnded', () => {
			this._streamingElement = null;
			this._hidePermission();
			this._setSendingEnabled(true);
			this._writeStatus('', false);
			this._messageElement.focus();
		});

		this._listenFor('error', (event) => {
			this._streamingElement = null;
			this._setSendingEnabled(true);
			this._writeStatus(event.message, true);
		});

		this._eventSource.addEventListener('error', () => {
			this._writeStatus('The connection to paullette was lost. It will try again on its own.', true);
		});

		this._eventSource.addEventListener('open', () => {
			this._writeStatus('', false);
			void this._readState();
		});
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Listens for one kind of event on the stream, and hands the handler the event already read back from JSON.
	 *
	 * @param kind The kind of event to listen for, which is also the name the server writes on the stream.
	 * @param handler What to do with the event of that kind.
	 * @returns Nothing.
	 */
	private _listenFor<Kind extends WebEvent['kind']>(
		kind: Kind,
		handler: (event: Extract<WebEvent, { kind: Kind }>) => void,
	): void {
		this._eventSource.addEventListener(kind, (streamEvent) => {
			const data = (streamEvent as MessageEvent<string>).data;
			handler(JSON.parse(data) as Extract<WebEvent, { kind: Kind }>);
		});
	}

	/**
	 * Finds one element of the page by its identifier, and says so plainly when the page has no such element.
	 *
	 * @param identifier The identifier written in `index.html`.
	 * @returns The element.
	 */
	private static _element<ElementType extends HTMLElement = HTMLElement>(identifier: string): ElementType {
		const element = document.getElementById(identifier);
		if (element === null) {
			throw new Error(`The page holds no element with the identifier ${identifier}.`);
		}

		return element as ElementType;
	}

	/**
	 * What went wrong, in words that can be written on the page.
	 *
	 * @param caughtError What was thrown.
	 * @returns The message of the error, or the error itself written out when it is not an error.
	 */
	private static _reasonOf(caughtError: unknown): string {
		return caughtError instanceof Error ? caughtError.message : String(caughtError);
	}
}

ChatPage.start();
