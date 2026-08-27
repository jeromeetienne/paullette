/*
	The script of the paullette web interface.

	It is plain JavaScript sent to the browser as it is. It is in no tsconfig include list, because the TypeScript
	configuration of this repository declares no browser library and a Node.js package should not start declaring
	one. See packages/paullette-web/CONTEXT.md.

	Everything this page shows about a turn arrives over one server-sent events stream at /api/events. Everything
	the page has to say goes back in an ordinary request.
*/

(function () {
	'use strict';

	var conversationElement = document.getElementById('conversation');
	var emptyNoteElement = document.getElementById('empty-note');
	var permissionElement = document.getElementById('permission');
	var permissionSummaryElement = document.getElementById('permission-summary');
	var permissionDetailElement = document.getElementById('permission-detail');
	var allowButton = document.getElementById('permission-allow');
	var alwaysButton = document.getElementById('permission-always');
	var refuseButton = document.getElementById('permission-refuse');
	var composerElement = document.getElementById('composer');
	var messageElement = document.getElementById('message');
	var sendButton = document.getElementById('send-button');
	var statusElement = document.getElementById('status');
	var sessionsButton = document.getElementById('sessions-button');
	var sessionsDialog = document.getElementById('sessions-dialog');
	var sessionsListElement = document.getElementById('sessions-list');
	var sessionsShownElement = document.getElementById('sessions-shown');
	var sessionsCloseButton = document.getElementById('sessions-close');

	/** The element the answer is being written into while the turn runs, or null between turns. */
	var streamingElement = null;
	/** The identifier of the permission question on the screen, or null when there is none. */
	var waitingPermissionIdentifier = null;
	/** True while a turn is running. */
	var isTurnRunning = false;

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Drawing The Conversation
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	function writeStatus(text, isError) {
		statusElement.textContent = text;
		statusElement.classList.toggle('is-error', isError === true);
	}

	function hideEmptyNote() {
		if (emptyNoteElement !== null && emptyNoteElement.parentNode !== null) {
			emptyNoteElement.parentNode.removeChild(emptyNoteElement);
			emptyNoteElement = null;
		}
	}

	function scrollToBottom() {
		window.scrollTo(0, document.body.scrollHeight);
	}

	/*
		Adds one message to the page. The HTML always comes from the server, which has already made sure that
		nothing the model wrote can be an element. The page never builds HTML out of text itself.
	*/
	function addMessage(role, html, parentElement) {
		hideEmptyNote();

		var messageElementToAdd = document.createElement('article');
		messageElementToAdd.className = 'message message-' + role;

		var whoElement = document.createElement('div');
		whoElement.className = 'message-who';
		whoElement.textContent = role === 'user' ? 'you' : 'paullette';

		var bodyElement = document.createElement('div');
		bodyElement.className = 'message-body';
		bodyElement.innerHTML = html;

		messageElementToAdd.appendChild(whoElement);
		messageElementToAdd.appendChild(bodyElement);
		(parentElement === undefined ? conversationElement : parentElement).appendChild(messageElementToAdd);

		return bodyElement;
	}

	function addToolLine(text) {
		hideEmptyNote();

		var lineElement = document.createElement('div');
		lineElement.className = 'tool-line';
		lineElement.textContent = text;
		conversationElement.appendChild(lineElement);
		scrollToBottom();
	}

	function startStreamingAnswer() {
		streamingElement = addMessage('assistant', '');
		streamingElement.classList.add('streaming');
	}

	function setSendingEnabled(isEnabled) {
		isTurnRunning = isEnabled === false;
		sendButton.disabled = isEnabled === false;
		messageElement.disabled = isEnabled === false;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Permission Question
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	function showPermission(event) {
		waitingPermissionIdentifier = event.identifier;
		permissionSummaryElement.textContent = event.summary;
		alwaysButton.textContent = 'always allow ' + event.toolName;

		if (typeof event.detail === 'string' && event.detail.length > 0) {
			permissionDetailElement.textContent = event.detail;
			permissionDetailElement.hidden = false;
		} else {
			permissionDetailElement.textContent = '';
			permissionDetailElement.hidden = true;
		}

		permissionElement.hidden = false;
		allowButton.focus();
	}

	function hidePermission() {
		waitingPermissionIdentifier = null;
		permissionElement.hidden = true;
	}

	function answerPermission(decision, isAlways) {
		if (waitingPermissionIdentifier === null) {
			return;
		}

		var identifier = waitingPermissionIdentifier;
		hidePermission();

		fetch('/api/permission', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				identifier: identifier,
				decision: decision,
				isAlways: isAlways === true,
			}),
		}).catch(function (caughtError) {
			writeStatus('The answer did not reach paullette: ' + caughtError.message, true);
		});
	}

	allowButton.addEventListener('click', function () {
		answerPermission('allowed', false);
	});
	alwaysButton.addEventListener('click', function () {
		answerPermission('allowed', true);
	});
	refuseButton.addEventListener('click', function () {
		answerPermission('refused', false);
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Sending A Message
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	function sendMessage() {
		var text = messageElement.value;
		if (text.trim().length === 0 || isTurnRunning === true) {
			return;
		}

		messageElement.value = '';
		setSendingEnabled(false);
		writeStatus('paullette is thinking…', false);

		fetch('/api/message', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: text }),
		})
			.then(function (response) {
				if (response.ok === true) {
					return null;
				}
				return response.json().then(function (body) {
					setSendingEnabled(true);
					writeStatus(body.error === undefined ? 'The message was refused.' : body.error, true);
					messageElement.value = text;
					return null;
				});
			})
			.catch(function (caughtError) {
				setSendingEnabled(true);
				writeStatus('The message did not reach paullette: ' + caughtError.message, true);
				messageElement.value = text;
			});
	}

	composerElement.addEventListener('submit', function (submitEvent) {
		submitEvent.preventDefault();
		sendMessage();
	});

	messageElement.addEventListener('keydown', function (keyboardEvent) {
		if (keyboardEvent.key === 'Enter' && keyboardEvent.shiftKey === false) {
			keyboardEvent.preventDefault();
			sendMessage();
		}
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Past Conversations
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	function showSession(identifier) {
		fetch('/api/sessions/' + encodeURIComponent(identifier))
			.then(function (response) {
				return response.json();
			})
			.then(function (body) {
				sessionsShownElement.innerHTML = '';
				sessionsShownElement.hidden = false;

				if (body.messages === undefined || body.messages.length === 0) {
					sessionsShownElement.textContent = 'Nothing was said in that conversation.';
					return;
				}

				body.messages.forEach(function (message) {
					addMessage(message.role, message.html, sessionsShownElement);
				});
			})
			.catch(function (caughtError) {
				sessionsShownElement.hidden = false;
				sessionsShownElement.textContent = 'That conversation could not be read: ' + caughtError.message;
			});
	}

	sessionsButton.addEventListener('click', function () {
		sessionsShownElement.hidden = true;
		sessionsShownElement.innerHTML = '';
		sessionsListElement.innerHTML = '';

		fetch('/api/sessions')
			.then(function (response) {
				return response.json();
			})
			.then(function (body) {
				if (body.sessions === undefined || body.sessions.length === 0) {
					var emptyItem = document.createElement('li');
					emptyItem.textContent = 'There is no saved conversation yet.';
					sessionsListElement.appendChild(emptyItem);
					return;
				}

				body.sessions.forEach(function (session) {
					var listItem = document.createElement('li');
					var openButton = document.createElement('button');
					openButton.type = 'button';

					var whenElement = document.createElement('div');
					whenElement.className = 'sessions-when';
					whenElement.textContent = session.startedAt;

					var aboutElement = document.createElement('div');
					aboutElement.className = 'sessions-about';
					aboutElement.textContent = session.modelName + ' — ' + session.itemCount + ' items';

					openButton.appendChild(whenElement);
					openButton.appendChild(aboutElement);
					openButton.addEventListener('click', function () {
						showSession(session.identifier);
					});

					listItem.appendChild(openButton);
					sessionsListElement.appendChild(listItem);
				});
			});

		sessionsDialog.showModal();
	});

	sessionsCloseButton.addEventListener('click', function () {
		sessionsDialog.close();
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Stream
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	function readState() {
		fetch('/api/state')
			.then(function (response) {
				return response.json();
			})
			.then(function (state) {
				document.getElementById('model-name').textContent = state.modelName;
				document.getElementById('working-directory-path').textContent = state.workingDirectoryPath;
				document.getElementById('session-identifier').textContent = state.sessionIdentifier;
				document.title = 'paullette — ' + state.modelName;

				conversationElement.innerHTML = '';
				emptyNoteElement = null;

				state.messages.forEach(function (message) {
					addMessage(message.role, message.html);
				});

				if (state.messages.length === 0) {
					var noteElement = document.createElement('p');
					noteElement.className = 'empty-note';
					noteElement.textContent = 'Ask paullette something.';
					conversationElement.appendChild(noteElement);
					emptyNoteElement = noteElement;
				}

				setSendingEnabled(state.isTurnRunning === false);

				if (state.pendingPermission !== null) {
					showPermission(state.pendingPermission);
				}
			})
			.catch(function (caughtError) {
				writeStatus('paullette could not be reached: ' + caughtError.message, true);
			});
	}

	var eventSource = new EventSource('/api/events');

	function listenFor(eventName, handler) {
		eventSource.addEventListener(eventName, function (messageEvent) {
			handler(JSON.parse(messageEvent.data));
		});
	}

	listenFor('turnStarted', function (event) {
		addMessage('user', '');
		conversationElement.lastElementChild.querySelector('.message-body').textContent = event.message;
		setSendingEnabled(false);
		writeStatus('paullette is thinking…', false);
		streamingElement = null;
		scrollToBottom();
	});

	listenFor('text', function (event) {
		if (streamingElement === null) {
			startStreamingAnswer();
		}
		streamingElement.textContent += event.delta;
		scrollToBottom();
	});

	listenFor('toolCalled', function (event) {
		addToolLine('→ ' + event.toolName);
	});

	listenFor('toolOutput', function (event) {
		addToolLine('← ' + event.toolName);
	});

	listenFor('permissionRequested', showPermission);

	listenFor('permissionAnswered', function (event) {
		if (waitingPermissionIdentifier === event.identifier) {
			hidePermission();
		}
		addToolLine('· ' + event.decision);
	});

	listenFor('answerRendered', function (event) {
		if (streamingElement === null) {
			startStreamingAnswer();
		}
		streamingElement.classList.remove('streaming');
		streamingElement.innerHTML = event.html;
		streamingElement = null;
		scrollToBottom();
	});

	listenFor('turnEnded', function () {
		streamingElement = null;
		hidePermission();
		setSendingEnabled(true);
		writeStatus('', false);
		messageElement.focus();
	});

	listenFor('error', function (event) {
		streamingElement = null;
		setSendingEnabled(true);
		writeStatus(event.message, true);
	});

	eventSource.addEventListener('error', function () {
		writeStatus('The connection to paullette was lost. It will try again on its own.', true);
	});

	eventSource.addEventListener('open', function () {
		writeStatus('', false);
		readState();
	});

	readState();
})();
