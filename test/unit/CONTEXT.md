# Directory Context: `/test/unit`

## Purpose
Holds the unit test suite: one test file per source file, each one calling the code in `src/` directly and proving what that one piece does on its own. This is the fast half of the testing. The other half is the verification runner one folder up, which starts code-agent as a separate process and calls a real model.

## Key Exports & Entry Points
- `<source file name>_test.ts`: the tests of `src/**/<source file name>.ts`. A test file is named after the source file it covers, so that the file to open is never in doubt.
- `libs/`: the folders, the fake permission asker, the tool caller, and the standard error capture that the test files share — see its own CONTEXT.md.
- Command to run this folder: `npm run test:unit`. `npm test` runs this folder and then `npm run verify`.

## Rules
- A test here never calls a model and never reaches the network, so the whole folder runs in seconds and needs no local endpoint running.
- A test never writes into the repository. It writes into a folder made by `TemporaryFolder`, and removes it in an `afterEach`.
- A test never reads a constant out of the code it is testing to build the value it then asserts on. A cap or a default is written out again in the test, so that changing the code makes the test fail rather than agreeing with itself.
- A tool is called through `ToolHarness.invoke`, the way the OpenAI Agents SDK calls it, rather than by reaching for the function inside. That is what makes the schema of the tool part of what is tested.
- A test that makes code print to the standard error wraps the call in `StandardErrorCapture.run`, so that the output of the test run stays readable.

## Background
- The two halves cover different failures and neither replaces the other. The verification runner proves the whole chain works against a real model, which is slow and not deterministic; these tests prove each piece behaves at its edges — a path that climbs out of the working folder, a file with broken frontmatter, a permission that was refused — which the verification runner cannot reach one case at a time. The verification runner and what it does not cover are written down in [`../CONTEXT.md`](../CONTEXT.md) and in [`../../TODO.md`](../../TODO.md).
- The interactive loop is still the part with no coverage on either side, because driving it needs a pseudo terminal. What these tests reach of it is the part that can be called without one: `SlashCommandHandler`, `CommandExpander`, and the refusal `PermissionPrompt` gives when there is no terminal to ask at.
