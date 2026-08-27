# Directory Context: `/packages/paullette-core/src/config_folder`

## Purpose
Finds the one `.paullette` folder at the project root, makes it when it is absent, and reads the instruction document, the subagents, the slash commands, and the skills out of it.

## Key Exports & Entry Points
- `config_folder_reader.ts`: `ConfigFolderReader.read()`, which does all of the above in one call. Everything else here is called by it.
- `config_folder_locator.ts`: `ConfigFolderLocator.locate()` and `ensureFolders()`.
- `config_folder_types.ts`: `AgentDefinition`, `CommandDefinition`, `SkillDefinition`, `InstructionDocument`, and the Zod schemas for the frontmatter of each.
- `frontmatter_parser.ts`: `FrontmatterParser.parse()`, which splits a Markdown file into its YAML frontmatter and its body.

## Rules
- paullette reads exactly one folder, at the project root. It does not search `~/.claude`, and it does not walk up through parent folders. Adding that later touches only the locator.
- The file formats inside are the Claude Code formats, unchanged, so that an existing `.claude` folder works by being copied across. That is what makes a subagent tool list parse from either `tools: ["Read", "Grep"]` or `tools: Read, Grep`.
- A file whose frontmatter cannot be understood is skipped, never thrown on. One bad file in a folder copied from another project must not stop paullette from starting.
- Nothing here calls the model or asks the user anything. It reads files and returns what it found.
- The `model` field of a subagent is read and then ignored, because paullette runs one configured model. This is deliberate: a folder copied from a Claude Code project names Anthropic models the configured endpoint does not serve.

## Background
- A subagent called `secret-keeper` reaches the model as a tool called `secret_keeper`. The OpenAI Agents SDK normalises a tool name that way whatever paullette does, so `SubagentTools.toToolName` normalises it identically rather than letting the reported name and the real name differ.
