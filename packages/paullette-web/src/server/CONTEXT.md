# Directory Context: `/packages/paullette-web/src/server`

## Purpose
Everything that talks to a browser: the web server itself, the routes, the stream that carries a turn as it happens, the permission question the browser answers, and the turning of what the model wrote into HTML for the page.

## Key Exports & Entry Points
- `web_server.ts`: `WebServer`, built with the conversation and an address, with `listen()` and `close()`. It is an Express application served by the `node:http` module of Node.js.
- `web_router.ts`: `WebRouter.build()`, which gives back the Express router holding every route, the reader of a body, the not found, and the last resort.
- `web_conversation.ts`: `WebConversation`, the one conversation every browser shares, which starts a turn, answers a permission question, and lists the past sessions.
- `web_event_stream.ts`: `WebEventStream`, which holds every open server-sent events stream and writes one event to all of them.
- `web_permission_asker.ts`: `WebPermissionAsker`, which implements the `PermissionAsker` interface from `paullette-core/tools/tool_types` by parking the promise until an answer arrives.
- `web_markdown.ts`: `WebMarkdown.toHtml()` and `WebMarkdown.escape()`.
- `web_static_files.ts`: `WebStaticFiles.servedPaths()` and `WebStaticFiles.read()`, which serve the three files of `public/` and the stylesheet of Bootstrap.
- `web_types.ts`: the shape of every event sent to the browser and of every body it sends back.

## Rules
- Nothing here builds an agent, a tool, or a session store. All of it is built at startup by `packages/paullette-cli/src/cli.ts` and handed in, so that the terminal interface and the web interface answer with the same agent.
- Only one turn runs at a time. A message sent while a turn is running is refused with a sentence a person can read, never queued, because the agent runs tools in one working folder.
- Nothing the model wrote ever becomes an element in the page. `WebMarkdown` replaces the raw HTML of the model with visible text, drops the address of a link whose scheme is not `http`, `https`, or `mailto`, and never writes an `img` element at all.
- The list of files `WebStaticFiles` serves is written out in the file, and the router registers one route for each whole path in it. `express.static` is never used, and no path from a web address is ever resolved against a folder, so there is nothing to climb out of.
- Nothing beyond the router is mounted on the Express application, no compression above all. The stream at `/api/events` has to reach the browser as each event is written, and a compressor holds what it is given until it has enough of it to be worth compressing.
- `WebPermissionAsker` refuses every question still waiting when the server closes. A tool parked on a question nobody will answer would hold the turn, and the turn would hold the process.
- An "always allow" answer is remembered for this run only and never written to disk, which is the same rule `PermissionPrompt` follows in `packages/paullette-cli/src/terminal/`.
- The route that starts a turn answers at once and does not wait for the turn. The browser is told what happens over the stream it already has open.

## Background
- That a permission question can be pushed to a browser over an open stream and answered by a second request while the turn is parked was proved live against the real server, the real streamed run, and the real LM Studio endpoint before any of this was written. The raw output, and the reasons for server-sent events over a websocket and for one shared conversation over one conversation per browser, are in the plan on [issue #9](https://github.com/jeromeetienne/paullette/issues/9).
- `WebMarkdown` escapes the raw HTML of the model inside the renderer of `marked` and not before it. Escaping the text first was tried and was wrong: it turned `1 < 2` inside a fenced code block into `1 &lt; 2` on the screen, because `marked` escapes the ampersand again inside a code block.
