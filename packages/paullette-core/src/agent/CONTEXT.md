# Directory Context: `/packages/paullette-core/src/agent`

## Purpose
Turns the configuration and whatever was read out of the `.paullette` folder into an agent the OpenAI Agents SDK can run, and runs one turn of a conversation with it.

## Key Exports & Entry Points
- `model_provider.ts`: `ModelProvider.configure()`, which points the OpenAI Agents SDK at the configured endpoint. It must be called once before any agent is built or run.
- `system_prompt_builder.ts`: `SystemPromptBuilder.build()`, which assembles the instructions the agent is given on every turn.
- `agent_builder.ts`: `AgentBuilder.build()`, which returns the `Agent`.
- `conversation_session.ts`: `ConversationSession`, which holds the conversation, runs one turn, and writes the conversation to `.paullette/sessions` through `SessionStore`.
- `conversation_turn_types.ts`: `ConversationTurnEvent` and `ConversationTurnListener`, which is what a front end is told while a turn runs.

## Rules
- `ModelProvider.configure` makes three calls and all three are needed. `setOpenAIAPI('chat_completions')` is the one that is easy to drop and impossible to do without: the SDK talks to the Responses API by default, and almost no OpenAI API compatible endpoint implements it.
- A skill contributes only its name and its description to the system prompt, never its instructions. The agent reads the instructions by calling the `load_skill` tool. Putting every skill body in the prompt would swamp a small local model.
- Nothing here reads a file or asks the user anything, apart from `ConversationSession`, which writes the conversation through `SessionStore`. The builders are given what was already read, so that the same builders serve the one-shot mode, the interactive loop, and the web interface without change.
- `ConversationSession` lives here and not in a front end, because both front ends run a turn the same way and neither one may hold agent logic of its own. It knows nothing about a terminal and nothing about a browser: it reports what happens through `ConversationTurnListener`, and the front end decides what to draw.
- `ConversationSession.runTurn` reads the run as a stream of events and not as a stream of text, because a front end that draws a page has to say that a tool was called and not only what the model wrote.

## Background
- The three calls in `model_provider.ts` were proven live against LM Studio before any of this was written; see the "What is already proven" section of [issue #1](https://github.com/jeromeetienne/paullette/issues/1).
- `ConversationSession` was moved here out of `packages/paullette-cli/src/terminal/` when the web interface was built. That the text read out of the raw events is the whole answer, with nothing lost against `result.toTextStream()`, was proved live first; the raw output is in the plan on [issue #9](https://github.com/jeromeetienne/paullette/issues/9).
