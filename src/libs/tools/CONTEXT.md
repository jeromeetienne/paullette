# Directory Context: `/src/libs/tools`

## Purpose
Holds every tool the agent can call: reading and changing files, searching, and running shell commands.

## Key Exports & Entry Points
- `tool_registry.ts`: `ToolRegistry.createAll()` builds every tool, and `ToolRegistry.filterByName()` narrows the list down to what a subagent asked for in its frontmatter.
- `tool_types.ts`: `ToolContext`, and the `PermissionAsker` interface every tool asks through.
- `tool_paths.ts`: `ToolPaths.resolveInside()`, `describe()`, and `capOutput()`.
- `file_tools.ts`, `search_tools.ts`, `shell_tools.ts`: the tools themselves, each exposing `createAll(context)`.

## Rules
- Nothing here imports from `cli/`. A tool asks for permission through the `PermissionAsker` interface declared in `tool_types.ts`, and `cli/permission_prompt.ts` implements it. Turning that around would make the tools impossible to use from anywhere but a terminal.
- Every tool that takes a path resolves it with `ToolPaths.resolveInside`, which refuses a path outside the working folder. The model chooses these paths, and a small model asked to read a project file will produce `../../` sooner or later.
- Every tool that changes a file or runs a shell command asks the permission asker first, and returns a sentence telling the model not to try again when the answer is no.
- A tool returns a readable sentence when something goes wrong rather than throwing, so that the model can try something else instead of the whole turn ending on one bad path.
- Every tool result goes through `ToolPaths.capOutput`. One unbounded file would fill the context window of a small local model and end the conversation.
- `ShellTools.runShellCommand` is exported on its own as well as wrapped in a tool, because the slash command expansion runs `!` commands through the same permission asker. A command hidden in a slash command file must not run unseen.

## Background
- The permission prompt refuses rather than allows when there is no terminal to ask at. See the verification step `permissionRefused` in `test/libs/verification_checks_model.ts`.
