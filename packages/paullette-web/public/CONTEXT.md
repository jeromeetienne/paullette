# Directory Context: `/packages/paullette-web/public`

## Purpose
Everything sent to a browser: the one page of the web interface, the few stylesheet rules Bootstrap cannot reach, and the TypeScript of the script that page runs.

## Key Exports & Entry Points
- `chat/index.html`: the page. It is what `express.static` answers at the root of the address.
- `chat/css/chat_page.css`: the rules of our own, served at `/css/chat_page.css`.
- `chat/src/chat_page.ts`: the script, served at `/js/chat_page.js` with its types taken out, and served as it is at `/src/chat_page.ts` for a browser that follows the source name written at the bottom of the JavaScript.
- Command to run this folder: `npm start --workspace paullette -- web` at the root of the repository.

## Rules
- `chat/` is the whole of what a browser can reach here. `WebApplication` mounts `express.static` on `chat/` and never on `public/` itself, so a file added beside `chat/` — this one, for a start — is not served.
- No subfolder of `chat/` holds a `CONTEXT.md` of its own. Everything under `chat/` is served, and a file describing the repository to whoever works on it does not belong at a web address.
- The script is written in TypeScript, and the types are taken out of it on every request rather than compiled ahead of time. It may hold no `enum` and no `namespace`: those are the two things types cannot simply be taken out of, and both stop the page from being served at all. See [`../src/server/CONTEXT.md`](../src/server/CONTEXT.md).
- The script is one classic script and not a module: it declares one class and calls it, and it imports nothing that is not a type. A value import would still be an import once the types were taken out, and the browser is given the file with no `type="module"` on it.
- The types the script shares with the server are imported from `../../../src/server/web_types.ts`, as types and never as values, so that the two sides of every event and every body cannot drift apart. `src/` is not in the `files` list this package publishes; that import is read by the compiler and by nothing else, and it is gone from what the browser is sent.
- Everything the page looks like comes from Bootstrap classes. A rule is added to `chat/css/chat_page.css` only when no Bootstrap class can reach what it does, and it carries a comment saying which one was looked for and why it does not fit.
- The page never builds HTML out of text. The HTML of an answer always comes from the server, which has already made sure that nothing the model wrote can be an element.

## Background
- Why the types are taken out at run time rather than compiled, and what that costs, is written out in [`../src/server/CONTEXT.md`](../src/server/CONTEXT.md) and in [`../../../docs/web_interface.md`](../../../docs/web_interface.md).
