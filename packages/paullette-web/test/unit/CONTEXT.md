# Directory Context: `/packages/paullette-web/test/unit`

## Purpose
Holds the unit test suite of the `paullette-web` package: one test file per source file, each one calling the code in `packages/paullette-web/src/` directly. The rest of the unit test suite lives in [`/packages/paullette-core/test/unit`](../../../paullette-core/test/unit/CONTEXT.md) and in [`/packages/paullette-cli/test/unit`](../../../paullette-cli/test/unit/CONTEXT.md), and the verification runner that starts paullette as a separate process lives in [`/test`](../../../../test/CONTEXT.md).

## Key Exports & Entry Points
- `<source file name>_test.ts`: the tests of `packages/paullette-web/src/**/<source file name>.ts`. A test file is named after the source file it covers, so that the file to open is never in doubt.
- Command to run this folder: `npm run test:unit --workspace paullette-web`.

## Rules
- A test here never calls a model and never reaches a machine other than this one, so the whole folder runs in seconds and needs no local endpoint running.
- A test never starts the web server on a fixed port. `web_api_router_test.ts` and `web_application_test.ts` start the Express application on the port the operating system gives it and ask it over the network, and every other test calls the code directly, so that two test runs at once cannot collide.
- `web_application_test.ts` builds the application with an empty object in place of the conversation, because not one of its tests reaches the conversation. Standing an agent and a session store up to hold a conversation nothing touches would say the opposite of what is true.
- A test never writes into the repository. It writes into a folder made by `TemporaryFolder`, and removes it in an `afterEach`.
- The shared test helpers are reached as `paullette-core/test_helpers/<file name>`, never through a relative path that climbs out of `packages/paullette-web`. They are not copied here; the one copy lives in `packages/paullette-core/test/libs/`.

## Background
- Whether a whole turn really reaches the browser is not asked here. It is asked by the verification runner in [`/test`](../../../../test/CONTEXT.md), which starts `paullette web` as a separate process and talks to it over the network, because that is the only place the whole chain exists.
