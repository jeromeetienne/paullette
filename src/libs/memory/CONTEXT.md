# Directory Context: `/src/libs/memory`

## Purpose
Reads and writes `.doublure/memory`, which is where doublure keeps what it was asked to remember between sessions.

## Key Exports & Entry Points
- `memory_store.ts`: `MemoryStore`, built with the path of the `.doublure/memory` folder. It reads the index, lists, reads, writes, and deletes.
- `memory_types.ts`: `MemoryEntry`, `MemoryEntryType`, and the Zod schema of the frontmatter of a memory file.

## Rules
- One remembered fact lives in one file. Only the index goes into the system prompt, and a fact is read in full only when the agent asks for it by name. Putting every fact in the prompt would swamp a small local model, which is the same reason skills are loaded on demand.
- `MEMORY.md` is rewritten from the files that are actually on disk every time something changes, never appended to. An index built by appending drifts away from the files beside it and then lies.
- The file format is the one Claude Code writes, frontmatter and all, so that the same folder can be read by both.
- The name of a fact goes through `MemoryStore.toFileName` before it touches the disk. The model chooses these names, so they cannot be trusted to be safe file names.

## Background
- `memory_write` takes four arguments, and a model has to build one JSON object holding all four to call it. `google/gemma-4-e2b` cannot do that: it emits malformed JSON and the call never reaches the tool. That is why doublure defaults to `qwen3.5-4b`. See the note at the end of `TODO.md`.
