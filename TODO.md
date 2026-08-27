# paullette — build checklist

The plan is [issue #1](https://github.com/jeromeetienne/paullette/issues/1). This file is the progress state that survives a restart: the plan says what to build, this file says how far the build got.

## How to work through this file

Do one unchecked item at a time. After each item: run `npm run verify`, tick the box only when the verification step named next to it reports PASS, then commit with `#1` in the commit message. Never tick a box because the code looks right — tick it because the named verification step passed. When a verification step needs a model that picks tools too unreliably, rerun it against `qwen3.5-4b` and write the difference down under Notes at the bottom, rather than hiding it.

`npm run verify` is the single command that answers "is it done". It exits with a status of zero only when every step passes.

## The non-interactive contract

The verification runner drives paullette through these options. They exist so that a check can prove something without a person typing at a terminal, and the shape of each one is fixed by `test/libs/verification_types.ts`. Build them as written or the checks cannot run.

| option | what it does |
| --- | --- |
| `--print <prompt>` | Runs one turn and exits. The answer goes to the standard output, the log of the tool calls goes to the standard error, so a check can read the answer without the log getting in the way. |
| `--list` | Prints what was loaded from `.paullette` as JSON, matching the `ListOutput` type, and exits without calling the model. |
| `--expand "<slash command>"` | Prints the expanded text of a slash command and exits without calling the model. |
| `--yes` | Approves every permission request instead of asking. |
| `--resume` | Continues the newest session in `.paullette/sessions` instead of starting a new one. |
| no option | Starts the interactive loop that reads from the terminal. |

Two behaviours matter as much as the options themselves. When there is no terminal and `--yes` was not given, every permission request is refused rather than granted, which is what the `permissionRefused` check relies on. An option that does not exist yet must be rejected with a message holding the words "unknown option", which is the Commander.js default and is what lets the runner report PENDING instead of a failure.

paullette also writes one line to its standard error on every run, saying what it can currently do:

```
paullette-capabilities: {"toolNames":["read_file"],"hasMemory":false,"hasSessions":false}
```

The verification runner reads that line to tell a part that is not built yet from a part that is built and wrong. Keep it truthful and keep it in step with the `PaulletteCapabilities` type in `test/libs/verification_types.ts`. A capability reported as present when it is not turns a PENDING into a FAIL and sends a reader off debugging code that does not exist; worse, a capability wrongly reported absent hides a real failure.

## Milestone 0 — the harness

- [x] Permission allowlist in `.claude/settings.json`, so an unattended run does not stall on a prompt
- [x] This checklist
- [x] Verification runner under `test/`, with every step reporting PENDING until the code exists
- [x] Fixture `.paullette` folder under `test/fixture/`, holding one instruction document, one subagent, one slash command, and one skill

## Milestone 1 — the walking skeleton

The goal is the smallest thing that proves the whole chain works: command line to model to answer.

- [x] Move `src/claude_folder/` to `src/config_folder/`, renaming `claude_folder_types.ts` to `config_folder_types.ts`
- [x] `src/agent/model_provider.ts` — the three OpenAI Agents SDK calls from the plan
- [x] `src/agent/system_prompt_builder.ts` — a system prompt with no `.paullette` content yet
- [x] `src/agent/agent_builder.ts` — an agent with no tools yet
- [x] `src/cli.ts` — Commander.js option parsing and the `--print` one-shot mode → verification step `typecheck`, `endpoint`, `oneShotAnswer`

## Milestone 2 — the tools and the permission prompt

- [x] `src/tools/tool_types.ts` — `ToolContext` and the `PermissionAsker` interface
- [x] `src/tools/file_tools.ts` — `read_file`, `write_file`, `edit_file`, `list_directory`
- [x] `src/tools/search_tools.ts` — `glob_files`, `grep_files`
- [x] `src/tools/shell_tools.ts` — `run_shell_command`, with a timeout and an output cap
- [x] `src/tools/tool_registry.ts` — assembles and filters the tool list
- [x] `src/terminal/permission_prompt.ts` — refuses by default when there is no terminal → verification step `toolCallRead`, `permissionRefused`, `permissionAllowed`

## Milestone 3 — the `.paullette` folder

- [x] `config_folder_locator.ts` — finds the project root, creates `.paullette` when absent → verification step `folderCreated`
- [x] `instruction_loader.ts`, `agent_definition_loader.ts`, `command_definition_loader.ts`, `skill_definition_loader.ts`, `config_folder_reader.ts`
- [x] The `--list` option, printing what was loaded as JSON → verification step `fixtureLoaded`
- [x] `src/tools/skill_tools.ts` — the `load_skill` tool → verification step `skillLoaded`
- [x] `src/tools/subagent_tools.ts` — one tool per subagent, through `Agent.asTool()` → verification step `subagentCalled`

## Milestone 4 — memory

- [x] `src/memory/memory_types.ts` and `memory_store.ts`
- [x] `src/tools/memory_tools.ts` — `memory_list`, `memory_read`, `memory_write`, `memory_delete`
- [x] The `MEMORY.md` index in the system prompt → verification step `memoryWritten`

## Milestone 5 — history on disk

- [x] `src/history/history_types.ts` and `session_store.ts` → verification step `sessionSaved`, `sessionResumed`
- [x] `src/history/input_history_store.ts`

## Milestone 6 — the interactive command line interface

- [ ] `src/terminal/conversation_session.ts`, `output_renderer.ts`, `readline_interface.ts` — **written, but no verification step exercises it.** Driving the interactive loop needs a pseudo terminal, because `_runInteractive` refuses when the input is not a terminal.
- [ ] `src/terminal/slash_command_handler.ts` — `/help` and `/exit` first, then `/clear`, `/agents`, `/skills`, `/memory` — **written, but only the file commands are verified, through `--expand`.** No step types `/help` or `/exit` at a terminal.
- [x] The `--expand` option, printing an expanded slash command without calling the model → verification step `commandExpanded`
- [ ] Quitting on the interrupt key pressed twice and on the input stream closing, both saving the session first. Moved here from Milestone 5: a second press of the interrupt key only means anything once there is a loop to interrupt. The one-shot mode already handles a single press, and the conversation is written to disk before the model is called, so nothing is lost whenever paullette is stopped. — **written, but not verified.** Needs the same pseudo terminal as the loop itself.

## Milestone 7 — the finish

- [ ] A `CONTEXT.md` in every source folder, following the template in the personal instructions
- [ ] A `CLAUDE.md` at the repository root
- [ ] `README.md` rewritten: what paullette is, how to point it at an endpoint, what goes in `.paullette`
- [ ] Every box above ticked and `npm run verify` green

## Milestone 8 — the Model Context Protocol servers

The plan is [issue #7](https://github.com/jeromeetienne/paullette/issues/7).

- [x] `src/model_context_protocol/model_context_protocol_types.ts` — the Zod schema of a server entry, for both transports
- [x] `src/model_context_protocol/model_context_protocol_config_reader.ts` — reads and merges `.mcp.json`, the settings file of the project, and the settings file of the user
- [x] `src/model_context_protocol/model_context_protocol_server_launcher.ts` — starts every server, warns about the ones that fail, and stops them all on the way out
- [x] `src/model_context_protocol/model_context_protocol_tools.ts` — one tool of the agent per tool of a server, named after its server and asking the user before every call
- [x] `src/model_context_protocol/model_context_protocol_session.ts` — the one thing `cli.ts` starts and closes
- [ ] A verification step that declares a real server and proves the model calls one of its tools — **not written.** The whole milestone was proved live against `npx -y mcp-now` instead, and by the two unit test files.

Not built, and out of scope of issue #7: the resources and the prompts of a server, and a command to add, to remove, or to list a server.

## What is verified and what is not

There are two suites, and they cover different failures.

`npm run test:unit` is the unit test suite, which lives inside each package: `packages/paullette-core/test/unit` and `packages/paullette-cli/test/unit`. It calls the code of its own package directly, never calls a model, and runs in seconds. It covers the pieces one at a time at their edges: a path that climbs out of the working folder, frontmatter that is not valid YAML, a permission that was refused, a memory index that has to be rewritten. It cannot say whether the whole chain works, because nothing in it starts paullette or calls a model.

`npm run verify` exits zero: all fourteen steps pass. That covers the one-shot mode end to end — the `.paullette` folder, the tools, the permission prompt, the memory, the subagents, the skills, the slash command expansion, and the conversation history.

It does not cover the interactive loop. Nothing types at a terminal, so `/help`, `/exit`, the interrupt key, and the answer streaming out turn by turn are written but unchecked. Verifying them needs a pseudo terminal, because `_runInteractive` refuses to start when the input is not a terminal. Until that exists, treat the interactive loop as unproven however green the scoreboard looks.

## Stop condition

Stop when `npm run typecheck` is clean, `npm run test:unit` passes, `npm run verify` exits zero with every step PASS, and every box in this file is ticked. `npm test` runs the last two in that order. Nothing else counts as done.

## Notes

Write anything surprising here: a verification step that needed a different model, an endpoint that died mid run, a plan decision that turned out wrong.

### The capability line, added after Milestone 1

Milestone 1 made `--print` work, and that turned five PENDING steps into FAIL even though none of those parts had been written. One of them was worse than noise: `permissionRefused` passed, because it checks that no file was written without `--yes`, and no file was written for the simple reason that there was no file writing tool at all. A check that passes while the thing it checks does not exist is a false green, which is the one failure this harness exists to prevent.

The capability line above is the fix. Every check that calls the model now asks what paullette can do before it judges what paullette did.

### The default model, changed twice

The verification runner used to call `google/gemma-4-e2b`, the default model of paullette at the time. Milestone 4 showed that it cannot call `memory_write`: it emits malformed JSON for a four-field tool call, so the call never reaches the tool at all. The same code passes on `qwen3.5-4b` first time. The memory store is not at fault, and reshaping a sound tool to suit a two billion parameter model would have been the wrong trade, so the verification runner moved to `qwen3.5-4b` while paullette kept `google/gemma-4-e2b` as its own default.

That left the open question of whether the default itself should change. Running paullette by hand answered it: asking the default model to remember a fact produced "I was unable to save the fact to memory due to an error when using the tool" and nothing on disk, while the same request on `qwen3.5-4b` wrote both `.paullette/memory/default-endpoint.md` and its `MEMORY.md` index line, and a later run read the fact back through `memory_list` and `memory_read`. A default model that cannot use a whole feature of the product is the wrong default, so `qwen3.5-4b` is now the default of paullette. The verification runner and paullette call the same model again.

Setting `PAULLETTE_MODEL` still overrides both.

### A check that was measuring the wrong thing

The subagent check used to ask for the "project passphrase". `qwen3.5-4b` refused to fetch it, answering that passphrases are sensitive and naming the tool instead of calling it. The check was measuring how cautious the model is about secrets, not whether paullette routes a question to a subagent. It now asks for a release codename, which is dull enough to answer, and it passes.

### Model checks are tried more than once

Whether a model chooses to call a tool is not deterministic, so one sample does not settle what a check is asking. A check that calls the model is now tried up to three times, and the attempt it passed on is printed whenever it took more than one, so a check that starts needing three attempts is visible rather than quietly flaky.
