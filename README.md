# paullette

A coding agent for the command line. It reads a `.paullette` folder, and it runs on any endpoint that speaks the OpenAI API, including a local one.

paullette reads the same file formats as Claude Code, so a `.claude` folder copied across works without being changed.

## Quick start

Run it in the folder you want to work in:

```bash
npx paullette
```

By default paullette talks to `http://127.0.0.1:1234/v1`, which is the address the LM Studio local server listens on, and it asks that endpoint for the model `qwen3.5-4b`. Nothing is sent anywhere else, and no account is needed.

Ask one question and exit, without entering the conversation:

```bash
npx paullette --print "what does src/cli.ts do?"
```

Point it at another endpoint and another model:

```bash
npx paullette --base-url https://api.openai.com/v1 --api-key sk-your-key --model gpt-4o-mini
```

Hold the conversation in a browser instead of at the terminal:

```bash
npx paullette web
```

That starts a local web server, prints the address, and serves a page holding the conversation, with the answers of the model rendered as Markdown and a permission question shown as a form. It is written up in [`docs/web_interface.md`](docs/web_interface.md).

## Documentation

| Page | What it is for |
| --- | --- |
| [`docs/paullette_folder.md`](docs/paullette_folder.md) | The format reference of the `.paullette` folder: every frontmatter field of a subagent, a slash command, a skill, and a memory file, and what each one falls back to. |
| [`docs/mcp_server.md`](docs/mcp_server.md) | How to declare a Model Context Protocol server, both transports, how the three source files are merged, and what happens when a server does not start. |
| [`docs/web_interface.md`](docs/web_interface.md) | The web interface: what `npx paullette web` serves, the routes, how a permission question is answered from the browser, and why the default address is the loopback address. |
| [`docs/architecture.md`](docs/architecture.md) | How the parts of paullette fit together, in what order they run, and why each boundary is where it is. For somebody working on paullette itself. |
| [`docs/testing.md`](docs/testing.md) | The two test suites, what each one is good at, what neither covers, and how to add to either. |

The index of all of them is [`docs/README.md`](docs/README.md). The rest of this page is the short version.

## Command line options

| Command | What it does |
| --- | --- |
| `web` | Start a local web server, print its address, and serve the web interface until the interrupt key stops it. It takes `--port <number>`, `5000` by default, and `--host <address>`, `127.0.0.1` by default, along with every option below. |

| Option | What it does |
| --- | --- |
| `--print <prompt>` | Answer one prompt, print the answer to the standard output, and exit. |
| `--list` | Print what was read out of the `.paullette` folder as JSON, and exit. |
| `--expand <command>` | Print the expanded text of a slash command without calling the model. |
| `--resume` | Carry on the newest conversation in `.paullette/sessions` instead of starting a new one. |
| `--yes` | Approve every permission request instead of asking. |
| `--model <name>` | The identifier of the model to use. |
| `--base-url <address>` | The base address of the endpoint that speaks the OpenAI API. |
| `--api-key <key>` | The key sent to the endpoint. |
| `--max-turns <count>` | The largest number of model turns one request may take. The default is 40. |
| `-V`, `--version` | Print the version and exit. |
| `-h`, `--help` | Print the list of options and exit. |

## Configuration

A setting is read from the command line first, then from the environment, then from the default.

| Setting | Environment variable | Falls back to | Default |
| --- | --- | --- | --- |
| Base address of the endpoint | `PAULLETTE_BASE_URL` | `OPENAI_BASE_URL` | `http://127.0.0.1:1234/v1` |
| Key sent to the endpoint | `PAULLETTE_API_KEY` | `OPENAI_API_KEY` | `lm-studio` |
| Model identifier | `PAULLETTE_MODEL` | `OPENAI_MODEL` | `qwen3.5-4b` |

Each `PAULLETTE_` variable falls back to the matching `OPENAI_` variable, so an environment that is already set up for the OpenAI API works as it is.

## The `.paullette` folder

paullette reads exactly one folder, at the root of the project you run it in, and it creates that folder when it is absent. It does not read `~/.claude`, and it does not walk up through parent folders.

```
.paullette/
	CLAUDE.md          the instruction document read into the system prompt
	agents/            one Markdown file per subagent
	commands/          one Markdown file per slash command
	skills/            one folder per skill, each holding a SKILL.md
	memory/            one Markdown file per remembered fact, plus MEMORY.md
	sessions/          one JSON file per conversation
```

The instruction document is looked for as `CLAUDE.md` first and `PAULLETTE.md` second. `CLAUDE.md` comes first because a `.paullette` folder is most often a copy of a `.claude` folder.

Every file format inside is the Claude Code format, unchanged. A file whose frontmatter cannot be understood is skipped rather than stopping the run, so one bad file in a folder copied from another project does no harm.

One difference is worth knowing: the `model` field of a subagent is read and then ignored, because paullette runs the single model it was configured with. A folder copied from a Claude Code project names Anthropic models that your endpoint does not serve.

To see exactly what was loaded:

```bash
npx paullette --list
```

Every frontmatter field of every file, and what each one falls back to, is in [`docs/paullette_folder.md`](docs/paullette_folder.md).

## Slash commands

These are built in:

- `/help` — show the list of commands
- `/exit` or `/quit` — save the conversation and leave
- `/clear` — start a new conversation
- `/agents` — list the subagents that were loaded
- `/skills` — list the skills that were loaded
- `/commands` — list the slash commands that were loaded, the same list as `/help`
- `/memory` — list everything remembered about this project

Every Markdown file in `.paullette/commands` becomes a slash command named after the file. Three things are expanded in the body of the file before it is sent to the model:

- `$ARGUMENTS` becomes everything typed after the name of the command, and `$1` through `$9` become the separate words.
- `` !`some shell command` `` becomes the output of that command. The command asks for permission the same way any other shell command does, so nothing hidden in a slash command file runs unseen.
- `@some/path.ts` becomes the contents of that file.

To see what a command expands to without calling the model:

```bash
npx paullette --expand "/greet World"
```

## Tools

The agent can call these:

- `read_file`, `write_file`, `edit_file`, `list_directory`
- `glob_files`, `grep_files`
- `run_shell_command`
- `memory_list`, `memory_read`, `memory_write`, `memory_delete`
- `load_skill`
- one tool per subagent found in `.paullette/agents`
- one tool per tool of every Model Context Protocol server you declared

Every tool that takes a path refuses a path outside the working folder. Every tool that changes a file, runs a shell command, or reaches a Model Context Protocol server asks you first, unless you passed `--yes`. Every tool result is capped in size, so one large file cannot fill the context window of a small local model.

## Model Context Protocol servers

A Model Context Protocol server adds tools to the agent without changing the code of paullette. Declare a server in `.mcp.json` at the root of the project, in `.paullette/settings.json`, or in `~/.paullette/settings.json`, and paullette starts it, lists its tools, and offers them to the model. This repository declares one:

```json
{
	"mcpServers": {
		"now": {
			"type": "stdio",
			"command": "npx",
			"args": ["-y", "mcp-now"]
		}
	}
}
```

The name of every tool starts with the name of the server it came from, so the `get_current_date` tool of the `now` server reaches the model as `now_get_current_date`. Every call asks you first, exactly like a shell command does. A server that fails to start prints one line beginning with `paullette-warning:` and paullette carries on with the servers that did start.

The whole of it — both transports, every field of an entry, how the three files are merged, and what is not built — is in [`docs/mcp_server.md`](docs/mcp_server.md).

## Memory

What the agent remembers about a project lives in `.paullette/memory`, as one Markdown file per fact, with an index in `MEMORY.md` that is rewritten from the files that are actually there. The index is read into the system prompt at startup, so what was remembered in one run is known in the next.

## Sessions

Every conversation is written to `.paullette/sessions` as JSON, including the conversation you end with `/exit` and the one you interrupt. To carry on the newest one:

```bash
npx paullette --resume
```

## Working on paullette itself

```bash
git clone git@github.com:jeromeetienne/paullette.git
cd paullette
npm install
npm start
```

- `npm start` — run from the TypeScript source through `tsx`
- `npm run build` — compile every package to its own `dist`
- `npm run typecheck` — check the types of every package without emitting anything
- `npm run test:unit` — run the unit tests of every package
- `npm run verify` — run the full verification suite against a live endpoint
- `npm run verify:fast` — run only the steps that do not need the model to answer
- `npm test` — run the unit tests and then the full verification suite

The verification suite needs an endpoint to be serving at the address paullette is configured with. `npm run lmstudio:start` starts the LM Studio local server, and `npm run lmstudio:status` says whether it is running.

How the two suites work, what each one is good at, and what neither covers is in [`docs/testing.md`](docs/testing.md). How the parts of paullette fit together is in [`docs/architecture.md`](docs/architecture.md).

### How the repository is laid out

The repository is an npm workspace holding one package per part of paullette.

```
packages/
	paullette-core/    the agent, the configuration, the .paullette folder reader,
	                   the history, the memory, and the tools. Published as paullette-core.
	paullette-web/     the web interface: the web server, the routes, and the files
	                   sent to the browser. Published as paullette-web, and this is
	                   what npx paullette web starts.
	paullette-cli/     the terminal interface and the command line entry point.
	                   Published as paullette, and this is what npx paullette runs.
test/                  the verification runner, which starts paullette as a separate
	                   process. The unit tests live inside each package instead.
docs/                  the longer pages this README links to. Start at docs/README.md.
```

A package reaches another by name, for example `import { ToolRegistry } from 'paullette-core/tools/tool_registry';`. Nothing imports across a package folder by a relative path, and `paullette-core` never imports from either front end. That is what lets the terminal interface and the web interface sit on the same agent. The two front ends do not import from each other either, apart from `packages/paullette-cli/src/cli.ts` reaching `paullette-web` to hand over when `web` is typed.

All three packages carry the same version number and are published together by `npm run publish:all`.

## Licence

MIT
