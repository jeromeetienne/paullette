# Directory Context: `/src/history`

## Purpose
Keeps two different things on disk: the conversation itself, in `.paullette/sessions`, and the lines the user typed, in `.paullette/input_history.txt`.

## Key Exports & Entry Points
- `session_store.ts`: `SessionStore`, built with the path of the `.paullette/sessions` folder. It starts a session, saves one, and reads back the newest.
- `input_history_store.ts`: `InputHistoryStore`, built with the path of `.paullette/input_history.txt`.
- `history_types.ts`: `StoredSession` and `ConversationHistoryItem`.

## Rules
- The two stores answer two different needs and must not be merged. The session is what the model is given back when a conversation is resumed. The input history is only what was typed, so that the up arrow key can call back a long question from yesterday.
- A session is written before the model is called, not only after it answers. That is what makes an interrupt safe: whenever paullette is stopped, the file on disk already holds everything said up to that moment.
- The whole conversation is rewritten each time rather than appended to, so that a session file is always a complete and readable conversation rather than a log that has to be replayed.
- A session file is plain readable JSON on purpose. A person should be able to open one, see what was said, and delete it, without paullette being involved.
- `ConversationHistoryItem` is derived from `RunResult` rather than written out by hand, so that it cannot drift from what the OpenAI Agents SDK actually produces. The SDK does not export the item type from its root, and reaching inside the package to get it would break the next time the package is rearranged.

## Background
- Nothing is written when a session is started, only when a turn begins, so starting paullette and quitting without asking anything leaves no file behind.
