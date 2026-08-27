# Directory Context: `/packages/paullette-cli/test/unit`

## Purpose
Holds the unit test suite of the `paullette` package: one test file per source file, each one calling the code in `packages/paullette-cli/src/` directly. The rest of the unit test suite lives in [`/packages/paullette-core/test/unit`](../../../paullette-core/test/unit/CONTEXT.md), and the verification runner that starts paullette as a separate process lives in [`/test`](../../../../test/CONTEXT.md).

## Key Exports & Entry Points
- `<source file name>_test.ts`: the tests of `packages/paullette-cli/src/**/<source file name>.ts`. A test file is named after the source file it covers, so that the file to open is never in doubt.
- Command to run this folder: `npm run test:unit --workspace paullette`.

## Rules
- A test here never calls a model and never reaches the network, so the whole folder runs in seconds and needs no local endpoint running.
- A test never writes into the repository. It writes into a folder made by `TemporaryFolder`, and removes it in an `afterEach`.
- The shared test helpers are reached as `paullette-core/test_helpers/<file name>`, never through a relative path that climbs out of `packages/paullette-cli`. They are not copied here; the one copy lives in `packages/paullette-core/test/libs/`.
- A test that makes code print to the standard error wraps the call in `StandardErrorCapture.run`, so that the output of the test run stays readable.

## Background
- Only the part of the terminal interface that can be called without a pseudo terminal is reached here: `SlashCommandHandler`, `CommandExpander`, and the refusal `PermissionPrompt` gives when there is no terminal to ask at. The interactive loop itself still has no coverage on either half of the testing.
