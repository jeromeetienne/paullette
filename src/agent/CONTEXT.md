# Directory Context: `/src/agent`

## Purpose
Turns the configuration and whatever was read out of the `.doublure` folder into an agent the OpenAI Agents SDK can run.

## Key Exports & Entry Points
- `model_provider.ts`: `ModelProvider.configure()`, which points the OpenAI Agents SDK at the configured endpoint. It must be called once before any agent is built or run.
- `system_prompt_builder.ts`: `SystemPromptBuilder.build()`, which assembles the instructions the agent is given on every turn.
- `agent_builder.ts`: `AgentBuilder.build()`, which returns the `Agent`.

## Rules
- `ModelProvider.configure` makes three calls and all three are needed. `setOpenAIAPI('chat_completions')` is the one that is easy to drop and impossible to do without: the SDK talks to the Responses API by default, and almost no OpenAI API compatible endpoint implements it.
- A skill contributes only its name and its description to the system prompt, never its instructions. The agent reads the instructions by calling the `load_skill` tool. Putting every skill body in the prompt would swamp a small local model.
- Nothing here reads a file or asks the user anything. It is given what was already read, so that the same builders serve the one-shot mode and the interactive loop without change.

## Background
- The three calls in `model_provider.ts` were proven live against LM Studio before any of this was written; see the "What is already proven" section of [issue #1](https://github.com/jeromeetienne/doublure/issues/1).
