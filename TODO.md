# doublure — build checklist

The plan is [issue #1](https://github.com/jeromeetienne/doublure/issues/1). This file is the progress state that survives a restart: the plan says what to build, this file says how far the build got.

## How to work through this file

Do one unchecked item at a time. After each item: run `npm run verify`, tick the box only when the verification step named next to it reports PASS, then commit with `#1` in the commit message. Never tick a box because the code looks right — tick it because the named verification step passed. When a verification step needs a model that picks tools too unreliably, rerun it against `qwen3.5-4b` and write the difference down under Notes at the bottom, rather than hiding it.

`npm run verify` is the single command that answers "is it done". It exits with a status of zero only when every step passes.

## The non-interactive contract

The verification runner drives doublure through these options. They exist so that a check can prove something without a person typing at a terminal, and the shape of each one is fixed by `test/libs/verification_types.ts`. Build them as written or the checks cannot run.

| option | what it does |
| --- | --- |
| `--print <prompt>` | Runs one turn and exits. The answer goes to the standard output, the log of the tool calls goes to the standard error, so a check can read the answer without the log getting in the way. |
| `--list` | Prints what was loaded from `.doublure` as JSON, matching the `ListOutput` type, and exits without calling the model. |
| `--expand "<slash command>"` | Prints the expanded text of a slash command and exits without calling the model. |
| `--yes` | Approves every permission request instead of asking. |
| `--resume` | Continues the newest session in `.doublure/sessions` instead of starting a new one. |
| no option | Starts the interactive loop that reads from the terminal. |

Two behaviours matter as much as the options themselves. When there is no terminal and `--yes` was not given, every permission request is refused rather than granted, which is what the `permissionRefused` check relies on. An option that does not exist yet must be rejected with a message holding the words "unknown option", which is the Commander.js default and is what lets the runner report PENDING instead of a failure.

Doublure also writes one line to its standard error on every run, saying what it can currently do:

```
doublure-capabilities: {"toolNames":["read_file"],"hasMemory":false,"hasSessions":false}
```

The verification runner reads that line to tell a part that is not built yet from a part that is built and wrong. Keep it truthful and keep it in step with the `DoublureCapabilities` type in `test/libs/verification_types.ts`. A capability reported as present when it is not turns a PENDING into a FAIL and sends a reader off debugging code that does not exist; worse, a capability wrongly reported absent hides a real failure.

## Milestone 0 — the harness

- [x] Permission allowlist in `.claude/settings.json`, so an unattended run does not stall on a prompt
- [x] This checklist
- [x] Verification runner under `test/`, with every step reporting PENDING until the code exists
- [x] Fixture `.doublure` folder under `test/fixture/`, holding one instruction document, one subagent, one slash command, and one skill

## Milestone 1 — the walking skeleton

The goal is the smallest thing that proves the whole chain works: command line to model to answer.

- [x] Move `src/libs/claude_folder/` to `src/libs/doublure_folder/`, renaming `claude_folder_types.ts` to `doublure_folder_types.ts`
- [x] `src/libs/agent/model_provider.ts` — the three OpenAI Agents SDK calls from the plan
- [x] `src/libs/agent/system_prompt_builder.ts` — a system prompt with no `.doublure` content yet
- [x] `src/libs/agent/agent_builder.ts` — an agent with no tools yet
- [x] `src/main.ts` — Commander.js option parsing and the `--print` one-shot mode → verification step `typecheck`, `endpoint`, `oneShotAnswer`

## Milestone 2 — the tools and the permission prompt

- [ ] `src/libs/tools/tool_types.ts` — `ToolContext` and the `PermissionAsker` interface
- [ ] `src/libs/tools/file_tools.ts` — `read_file`, `write_file`, `edit_file`, `list_directory`
- [ ] `src/libs/tools/search_tools.ts` — `glob_files`, `grep_files`
- [ ] `src/libs/tools/shell_tools.ts` — `run_shell_command`, with a timeout and an output cap
- [ ] `src/libs/tools/tool_registry.ts` — assembles and filters the tool list
- [ ] `src/libs/cli/permission_prompt.ts` — refuses by default when there is no terminal → verification step `toolCallRead`, `permissionRefused`, `permissionAllowed`

## Milestone 3 — the `.doublure` folder

- [ ] `doublure_folder_locator.ts` — finds the project root, creates `.doublure` when absent → verification step `folderCreated`
- [ ] `instruction_loader.ts`, `agent_definition_loader.ts`, `command_definition_loader.ts`, `skill_definition_loader.ts`, `doublure_folder_reader.ts`
- [ ] The `--list` option, printing what was loaded as JSON → verification step `fixtureLoaded`
- [ ] `src/libs/tools/skill_tools.ts` — the `load_skill` tool
- [ ] `src/libs/tools/subagent_tools.ts` — one tool per subagent, through `Agent.asTool()` → verification step `subagentCalled`

## Milestone 4 — memory

- [ ] `src/libs/memory/memory_types.ts` and `memory_store.ts`
- [ ] `src/libs/tools/memory_tools.ts` — `memory_list`, `memory_read`, `memory_write`, `memory_delete`
- [ ] The `MEMORY.md` index in the system prompt → verification step `memoryWritten`

## Milestone 5 — history on disk

- [ ] `src/libs/history/history_types.ts` and `session_store.ts` → verification step `sessionSaved`, `sessionResumed`
- [ ] `src/libs/history/input_history_store.ts`
- [ ] Saving the session when the interrupt key is pressed twice and when the input stream closes

## Milestone 6 — the interactive command line interface

- [ ] `src/libs/cli/conversation_session.ts`, `output_renderer.ts`, `readline_interface.ts`
- [ ] `src/libs/cli/slash_command_handler.ts` — `/help` and `/exit` first, then `/clear`, `/agents`, `/skills`, `/memory`
- [ ] The `--expand` option, printing an expanded slash command without calling the model → verification step `commandExpanded`

## Milestone 7 — the finish

- [ ] A `CONTEXT.md` in every source folder, following the template in the personal instructions
- [ ] A `CLAUDE.md` at the repository root
- [ ] `README.md` rewritten: what doublure is, how to point it at an endpoint, what goes in `.doublure`
- [ ] Every box above ticked and `npm run verify` green

## Stop condition

Stop when `npm run typecheck` is clean, `npm run verify` exits zero with every step PASS, and every box in this file is ticked. Nothing else counts as done.

## Notes

Write anything surprising here: a verification step that needed a different model, an endpoint that died mid run, a plan decision that turned out wrong.

### The capability line, added after Milestone 1

Milestone 1 made `--print` work, and that turned five PENDING steps into FAIL even though none of those parts had been written. One of them was worse than noise: `permissionRefused` passed, because it checks that no file was written without `--yes`, and no file was written for the simple reason that there was no file writing tool at all. A check that passes while the thing it checks does not exist is a false green, which is the one failure this harness exists to prevent.

The capability line above is the fix. Every check that calls the model now asks what doublure can do before it judges what doublure did.
