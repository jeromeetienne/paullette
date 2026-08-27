# Using a Model Context Protocol server with paullette

A Model Context Protocol server adds tools to the agent without changing the code of paullette. You declare a server in a JSON file, and paullette starts it, asks it which tools it has, and offers those tools to the model beside its own built-in tools.

paullette reads the tools of a server. It does not read the resources or the prompts of a server.

## Where to declare a server

paullette reads three files. All three are optional, and none of them has to exist.

| File | What it is for |
| --- | --- |
| `~/.paullette/settings.json` | The settings file of your user account, in its `mcpServers` field. Put a server here when you want it in every project. |
| `.mcp.json` | A file at the root of the project, holding nothing but a `mcpServers` map. Put a server here when it belongs to the project and everyone working on the project should get it. |
| `.paullette/settings.json` | The settings file of the project, in its `mcpServers` field. `.paullette` is not committed, so put a server here when it is yours alone. |

The three files are read in the order of that table, from the weakest to the strongest. When two files declare a server of the same name, the stronger one wins: the settings file of the project wins over `.mcp.json`, and `.mcp.json` wins over the settings file of your user account. Everything else is added together, so a server declared in only one file is always kept.

The file names and the field names are the ones Claude Code uses, unchanged. A project that is already set up for Claude Code needs no new file.

## Declaring a server paullette starts itself

This is the standard input and output transport. paullette starts the server as a child process and talks to it over the standard input and the standard output of that process. This is what almost every server published on npm uses.

An entry names a `command`, and may name any of `args`, `env`, `cwd`, and `type`.

| Field | Required | What it is |
| --- | --- | --- |
| `command` | yes | The program to run, for example `npx`. |
| `args` | no | The arguments given to the program, as a list of strings. |
| `env` | no | Environment variables added to the environment of the child process, as a map of string to string. |
| `cwd` | no | The folder the child process runs in. paullette falls back to the working folder. |
| `type` | no | `stdio`. An entry that names a `command` is a standard input and output server whether or not you write this. |

This repository declares one such server in its own `.mcp.json`:

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

That server is [`mcp-now`](https://www.npmjs.com/package/mcp-now), which gives the agent the current date and the current time.

## Declaring a server paullette reaches over the network

This is the HTTP transport. paullette does not start the server: it is already running somewhere, and paullette sends requests to it.

An entry names a `url`, and may name `headers` and `type`.

| Field | Required | What it is |
| --- | --- | --- |
| `url` | yes | The address of the server. |
| `headers` | no | Headers sent with every request, as a map of string to string. This is where an authorisation header goes. |
| `type` | no | `http` for the streamable HTTP transport, or `sse` for the older one. paullette uses `http` when you write nothing. |

```json
{
	"mcpServers": {
		"remote": {
			"type": "http",
			"url": "https://example.com/model-context-protocol",
			"headers": {
				"Authorization": "Bearer YOUR_TOKEN"
			}
		}
	}
}
```

Never write a real token into `.mcp.json`, because that file is committed. Put a server that needs a token in `.paullette/settings.json` or in `~/.paullette/settings.json`, neither of which is committed.

## What the tools are called

The name of every tool starts with the name of the server it came from, joined by an underscore. The `get_current_date` tool of the `now` server reaches the model as `now_get_current_date`.

The name of the server is in front for one reason: two servers that expose a tool of the same name would otherwise collide, and the model would have no way to say which one it means.

Everything that is not a letter, a digit, or an underscore becomes an underscore, so a server called `my-server` gives a tool called `my_server_read_file`.

## Seeing which servers started

paullette writes one line to its standard error on every run saying what it can do. The names of the servers that started and the names of every tool are in that line:

```
paullette-capabilities: {"toolNames":["read_file",...,"now_get_current_date",...],"hasMemory":true,"hasSessions":true,"modelContextProtocolServerNames":["now"]}
```

The `--list` option prints the same servers as JSON, along with everything read out of the `.paullette` folder, and exits without calling the model:

```bash
npx paullette --list
```

## Trying it

With the `.mcp.json` of this repository in place:

```bash
npx paullette --yes --print "What is today's date? Answer with just the date."
```

The tool call and the answer look like this:

```
paullette-tool: now_get_current_date {}
2026-08-27
```

## Permission

Every call to a tool of a Model Context Protocol server asks you first, exactly as `run_shell_command` does. You see the name of the tool, the name of the server, and the arguments the model chose, and you answer before anything reaches the server. A tool that comes from outside paullette is not more trusted than a shell command, it is less.

`--yes` approves every request without asking. When there is no terminal to ask at and `--yes` was not given, every request is refused rather than granted.

The result of every call is capped in size, so one large result cannot fill the context window of a small local model.

## When a server does not start

A server that is not installed, that fails to start, or that does not answer within twenty seconds is reported as one line on the standard error, and paullette carries on with the servers that did start:

```
paullette-warning: The Model Context Protocol server broken declared in /path/to/.mcp.json did not start, so its tools are not available: spawn this-program-does-not-exist ENOENT
```

The same happens for a file that is not valid JSON, and for an entry that names neither a `command` nor a `url`: one warning, and everything else is still read. Nothing about a Model Context Protocol server ever stops paullette from starting.

Every server is stopped when paullette exits.

## What is not built

- The resources and the prompts of a server. paullette reads the tools only.
- A command to add, to remove, or to list a server. Write the JSON file by hand.
- A subagent declared in `.paullette/agents` is given the built-in tools only, never the tools of a server.

The reasons are on [issue #7](https://github.com/jeromeetienne/paullette/issues/7).
