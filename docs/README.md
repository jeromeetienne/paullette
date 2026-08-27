# The documentation of paullette

The [README at the root](../README.md) is the short version: what paullette is, how to point it at an endpoint, and what goes in a `.paullette` folder. These pages are the long versions.

## For somebody using paullette

- [`paullette_folder.md`](paullette_folder.md) — the format reference of the `.paullette` folder: the instruction document, the subagents, the slash commands, the skills, the memory, and the sessions, with every frontmatter field and what it falls back to.
- [`mcp_server.md`](mcp_server.md) — how to declare a Model Context Protocol server, both transports, how the three source files are merged, and what happens when a server does not start.
- [`web_interface.md`](web_interface.md) — what `npx paullette web` serves, the routes, how a permission question raised inside a tool call is answered from the browser, and why the default address is the loopback address.

## For somebody working on paullette itself

- [`architecture.md`](architecture.md) — how the parts fit together, in what order they run, and why each boundary is where it is.
- [`testing.md`](testing.md) — the two test suites, what each one is good at, what neither covers, and how to add to either.

## The other places things are written down

- [`/TODO.md`](../TODO.md) — how far the build got, and every decision that turned out to be surprising.
- A `CONTEXT.md` in every source folder — what may be imported from that folder and what must not be broken there. These are the rules; the pages above are the explanation.
- The issue tracker — the reasoning behind each piece of work. A rule in a `CONTEXT.md` links to the issue that proved it rather than retelling the story.
