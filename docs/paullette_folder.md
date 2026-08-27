# The `.paullette` folder

Everything a project tells paullette lives in one folder at the root of that project. This page is the format reference for every file in it.

paullette reads exactly one folder, at the project root, and it creates that folder and its subfolders when they are absent. It does not read `~/.claude`, and it does not walk up through a chain of parent folders. The project root is the nearest folder at or above where you started paullette that holds a `.git`, and the folder you started in when there is no `.git` above it — so paullette behaves the same from any subfolder of a project.

Every file format is the Claude Code format, unchanged. A `.claude` folder copied across and renamed works without any file being edited.

## The layout

```
.paullette/
	CLAUDE.md            the instruction document read into the system prompt
	agents/              one Markdown file per subagent
	commands/            one Markdown file per slash command
	skills/              one folder per skill, each holding a SKILL.md
	memory/              one Markdown file per remembered fact, plus MEMORY.md
	sessions/            one JSON file per conversation
	settings.json        optional, and read for its mcpServers field only
	input_history.txt    the lines you typed, for the up arrow key
```

To see exactly what was read:

```bash
npx paullette --list
```

## Two rules that hold everywhere

**A file that cannot be understood is skipped, never thrown on.** Frontmatter that is not valid YAML, a field of the wrong type, a folder with no `SKILL.md`: each one costs you that single file and nothing else. One bad file in a folder copied from another project must not stop paullette from starting.

**Every field of every frontmatter block is optional.** A Markdown file with no frontmatter at all is still read: its whole text becomes the body, and every name falls back to the name of its file or its folder.

## `CLAUDE.md` — the instruction document

The whole text of this file goes into the system prompt on every turn, under a heading naming the path it came from, and the prompt tells the model that these instructions outrank its general wording.

paullette looks for `CLAUDE.md` first and `PAULLETTE.md` second, and takes the first one that exists and is not empty. `CLAUDE.md` comes first because a `.paullette` folder is most often a copy of a `.claude` folder.

There is no frontmatter. The file is plain Markdown.

## `agents/` — the subagents

One Markdown file per subagent. Every subagent becomes a tool the main agent can call, so the main agent hands a question to a subagent the same way it reads a file.

```markdown
---
name: codename-keeper
description: Knows the release codename of this project. Call this when asked for it.
tools: read_file, grep_files
---

You know that the release codename of this project is Bluefin.
Answer with the codename and nothing else.
```

| Field | Falls back to | What it is |
| --- | --- | --- |
| `name` | the file name without `.md` | The name of the subagent. |
| `description` | `The <name> subagent.` | The sentence that tells the main agent when to call this subagent. Write it well: this is the only thing the main agent sees when it decides. |
| `tools` | every ordinary tool | The tools this subagent may call. |
| `model` | — | **Read and then ignored.** |

The body below the frontmatter is the system prompt of the subagent.

### The `tools` field

Both spellings are accepted, because both appear in real Claude Code files:

```yaml
tools: read_file, grep_files
```

```yaml
tools: ["read_file", "grep_files"]
```

A name is matched whatever its capitalisation. **A name that matches nothing is passed over rather than refused**, so a subagent copied from a Claude Code project that asks for `Read` and `Bash` still runs, with a shorter tool list.

The tools a subagent may choose from are the ordinary ones only: `read_file`, `write_file`, `edit_file`, `list_directory`, `glob_files`, `grep_files`, and `run_shell_command`. A subagent never gets a memory tool, `load_skill`, a Model Context Protocol tool, or another subagent.

### Why `model` is ignored

paullette runs the one model it was configured with. A folder copied from a Claude Code project names Anthropic models that your endpoint does not serve, so honouring the field would break more often than it helped.

### The name the model sees

Everything that is not a letter, a digit, or an underscore becomes an underscore, so a subagent called `codename-keeper` reaches the model as the tool `codename_keeper`. `/agents` lists what was read.

## `commands/` — the slash commands

One Markdown file per command. The name of the command is the path of the file below `commands/`, without `.md`, with each folder separator turned into a colon — so `commands/git/commit.md` becomes `/git:commit`.

```markdown
---
description: Greet somebody by name
argument-hint: <name>
---

Say hello to $ARGUMENTS.

The current branch is !`git branch --show-current`.

Follow the style in @docs/style.md.
```

| Field | Falls back to | What it is |
| --- | --- | --- |
| `description` | `The <name> command.` | The sentence shown next to the name in `/help`. |
| `argument-hint` | nothing | The hint shown after the name in `/help`. |
| `allowed-tools` | — | **Recorded and not applied.** |
| `model` | — | **Read and then ignored.** |

The body is the message sent to the model, after three things in it are expanded.

### What is expanded in the body

| Written | Becomes |
| --- | --- |
| `$ARGUMENTS` | Everything you typed after the name of the command. |
| `$1` … `$9` | The separate words of what you typed, by position. A position with no word becomes nothing. |
| `` !`some command` `` | What that shell command printed. |
| `@some/path.ts` | The whole content of that file. |

**A shell command in a slash command file asks for permission exactly like any other shell command.** A slash command file arrives in a project the same way any other file does, so nothing hidden in one runs unseen.

A file reference that cannot be read is left exactly as it was written rather than replaced by an error message, because an at sign is a common enough character that not every one of them is meant as a file. A path that climbs out of the working folder is refused.

To see what a command expands to without calling the model:

```bash
npx paullette --expand "/greet World"
```

### The names paullette answers itself

These are answered by paullette and never reach the model. A file in `commands/` that takes one of these names is shadowed by it.

`/help`, `/exit`, `/quit`, `/clear`, `/agents`, `/skills`, `/commands`, `/memory`

## `skills/` — the skills

One folder per skill, each holding a `SKILL.md`. A folder without one is passed over.

```
.paullette/skills/
	release-notes/
		SKILL.md
		template.md
```

```markdown
---
name: release-notes
description: How this project writes its release notes. Load this before writing any.
---

Write one line per change, in the past tense, and link the issue.
The template is in template.md beside this file.
```

| Field | Falls back to | What it is |
| --- | --- | --- |
| `name` | the name of the folder | The name given to the `load_skill` tool. |
| `description` | `The <name> skill.` | The sentence that tells the agent when to load this skill. |
| `allowed-tools` | — | **Recorded and not applied.** |

### How a skill reaches the model

**Only the name and the description of a skill go into the system prompt.** The body arrives later, through the `load_skill` tool, and only when the agent decides it needs it. The answer of that tool also names the folder of the skill, so the agent can read the files beside `SKILL.md` with `read_file`.

That split is what keeps the system prompt small enough for a local model with a small context window. Write the description as the sentence that decides whether the skill is worth loading, not as a summary of what is in it.

The `load_skill` tool is not built at all when the project has no skills.

## `memory/` — what paullette remembers

One Markdown file per fact, plus `MEMORY.md` beside them.

```markdown
---
name: deploy-target-fastly
description: "This project deploys to Fastly, not to Cloudflare."
metadata:
  node_type: memory
  type: project
---

The deployment target is Fastly. The Cloudflare configuration in the repository is dead.
```

| Field | Falls back to | What it is |
| --- | --- | --- |
| `name` | the file name without `.md` | The short name of the fact, which is also its file name. |
| `description` | the name | The one line that goes in the index. |
| `metadata.type` | `project` | One of `user`, `feedback`, `project`, `reference`. |

| Type | What it is for |
| --- | --- |
| `user` | Who the person is: their role, what they know, what they prefer. |
| `feedback` | Guidance the person gave about how to work, including why. |
| `project` | Something about the work in hand that the code and the history do not already say. |
| `reference` | A pointer to something outside, such as an address or a ticket. |

A name given by the model is lowercased, and anything that is not a letter or a digit becomes a hyphen, so `Deploy Target` is written to `deploy-target.md`.

### `MEMORY.md`

One line per fact:

```markdown
# Memory

- [deploy-target-fastly](deploy-target-fastly.md) — This project deploys to Fastly, not to Cloudflare.
```

**It is rewritten from the files that are actually there** on every write and every delete, never appended to. Delete a memory file by hand and the index corrects itself on the next write. Edit `MEMORY.md` by hand and your edit is lost.

Only this index goes into the system prompt. A whole fact arrives through the `memory_read` tool.

`/memory` lists what is remembered. Writing and forgetting both ask for permission.

## `sessions/` — the conversations

One JSON file per conversation, named after the moment it started. The whole conversation is rewritten at the end of every turn, so a session file is always complete and readable.

```json
{
	"identifier": "2026-08-27T16-27-19-410Z-j8y5cd",
	"startedAt": "2026-08-27T16:27:19.410Z",
	"updatedAt": "2026-08-27T16:27:41.882Z",
	"modelName": "qwen3.5-4b",
	"history": []
}
```

The conversation is written **before** the model is called as well as after it answers, so stopping paullette part way through a turn loses at most that turn.

To carry on the newest one:

```bash
npx paullette --resume
```

`/clear` opens a new conversation and leaves the old file on disk. Nothing ever deletes a session file: open the folder and delete what you do not want.

## `settings.json` — the settings of the project

Read for its `mcpServers` field only. Anything else in the file is left alone. See [`mcp_server.md`](mcp_server.md).

`.paullette` is usually not committed, so a server declared here is yours alone. A server everyone on the project should get belongs in `.mcp.json` at the project root instead.

## `input_history.txt` — the lines you typed

One line each, up to a thousand, oldest first. This is what the up arrow key reaches back through, and it is a different thing from the conversation. A line the same as the one before it is not stored twice.

## What is not read

- `~/.claude` and `~/.paullette/agents`, `commands`, or `skills`. Only `~/.paullette/settings.json` is read, and only for its `mcpServers` field.
- Any `.paullette` folder in a parent folder or a subfolder of the project root.
- Any field of a settings file other than `mcpServers`.
