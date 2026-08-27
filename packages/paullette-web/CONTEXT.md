# Directory Context: `/packages/paullette-web`

## Purpose
The package named `paullette-web`. It is the web interface of paullette: a local web server that serves a conversation with the paullette agent in a browser, in place of the terminal interface. It is what `npx paullette web` starts.

## Key Exports & Entry Points
- `src/web_interface.ts`: `WebInterface.start()`, the one thing `packages/paullette-cli/src/cli.ts` imports from this package. It is given everything that was built at startup, listens, and returns the address to print.
- `src/server/`: the web server, the routes, the transport, and the permission asker — see its own CONTEXT.md.
- `public/`: the page, the stylesheet, and the script sent to the browser.
- `test/unit/`: the unit test suite of this package — see its own CONTEXT.md.
- Command to run this folder: `npm start --workspace paullette -- web` at the root of the repository.

## Rules
- Nothing here imports from the `paullette` package. The dependency runs one way: `cli.ts` imports `WebInterface` from here, and nothing here ever reaches back.
- Everything this package takes from `paullette-core` is imported by the package name, for example `paullette-core/agent/conversation_session`, never through a relative path that climbs out of this folder.
- No agent logic lives here. The agent, the tools, the conversation, and the session store all come from `paullette-core`, already built, so that the terminal interface and the web interface answer with the same agent.
- `public/` sits beside `src/` and never inside it, because `tsc` copies no file that is not TypeScript. It is found at run time with `Path.join(import.meta.dirname, '..', 'public')`, which resolves the same way from `src/` during development and from `dist/` once published.
- `public/paullette.js` is plain JavaScript sent to the browser as it is, and it belongs to no `tsconfig` include list, because the TypeScript configuration of this repository declares no browser library.
- The text of the model has `&`, `<`, and `>` replaced by their entities before it is turned into HTML, so that nothing the model writes can become an element in the page.

## Background
- The design of this package, the three open questions of [issue #2](https://github.com/jeromeetienne/paullette/issues/2) and their answers, and the live test that proved a permission question can be answered from a second request while the turn is parked, are in the plan on [issue #9](https://github.com/jeromeetienne/paullette/issues/9).
