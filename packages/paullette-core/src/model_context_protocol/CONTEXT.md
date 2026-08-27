# Directory Context: `/packages/paullette-core/src/model_context_protocol`

## Purpose
Reads the Model Context Protocol servers a project declares, starts them, turns the tools they expose into tools of the agent, and stops them again when paullette leaves.

## Key Exports & Entry Points
- `model_context_protocol_session.ts`: `ModelContextProtocolSession.start()` and `close()`, which do all of the above in two calls. This is the only file the command line interface imports.
- `model_context_protocol_config_reader.ts`: `ModelContextProtocolConfigReader.readAll()`, which reads and merges the three places a server may be declared.
- `model_context_protocol_server_launcher.ts`: `ModelContextProtocolServerLauncher.startAll()` and `stopAll()`.
- `model_context_protocol_tools.ts`: `ModelContextProtocolTools.createAll()` and `toToolName()`.
- `model_context_protocol_types.ts`: the Zod schemas of a server entry, and the types the four files above pass between themselves.

## Rules
- Nothing here ever throws at the caller. A file that is broken, a server that is not installed, and a server that will not answer all become a `ModelContextProtocolWarning`, and paullette starts with the servers that do work. One server that is missing must never keep a person from reaching the prompt.
- Every call to a tool of a Model Context Protocol server goes through `ToolContext.permissionAsker`, exactly like a shell command does. A tool that comes from outside paullette is not more trusted than a shell command, it is less.
- The name of every tool starts with the name of the server it came from, through `ModelContextProtocolTools.toToolName`, so that two servers that expose the same tool name do not collide.
- The result of every call goes through `ToolPaths.capOutput`, so that one large result cannot fill the context window of a local model.
- The three source files are read lowest first: the settings file of the user, then `.mcp.json` at the project root, then the settings file of the project. A later source wins over an earlier one for the same server name.
- The file names and the field names come from Claude Code and are kept unchanged, so `.mcp.json` and `mcpServers` are spelled the way Claude Code spells them, and nothing else here is abbreviated.
- This folder reads the Model Context Protocol tools only. The Model Context Protocol resources and the Model Context Protocol prompts are not read.

## Background
- The whole folder comes from [issue number 7](https://github.com/jeromeetienne/paullette/issues/7), which also says why the resources and the prompts are left out, and why no command is added to add, to remove, or to list a server.
- The transports come from `@openai/agents`, which already carries `MCPServerStdio`, `MCPServerStreamableHttp`, and `MCPServerSSE`, so paullette never speaks the protocol itself.
