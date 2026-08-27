# Directory Context: `/packages/paullette-core/test/libs`

## Purpose
Holds what the unit test files share: the temporary folders they write into, the permission asker they answer with, the way they call a tool, and the capture that keeps their printing out of the test output. The unit tests of the `paullette` package share these same four files, and reach them by the package name through the `./test_helpers/*` entry in the `exports` map of `paullette-core`, never by a relative path that climbs out of `packages/paullette-core`.

## Key Exports & Entry Points
- `temporary_folder.ts`: `TemporaryFolder.make`, `TemporaryFolder.remove`, and `TemporaryFolder.writeFile`.
- `fake_permission_asker.ts`: `FakePermissionAsker`, which answers every request the same way and keeps every request it was given.
- `tool_harness.ts`: `ToolHarness.makeContext`, which builds a `ToolContext` for a test, and `ToolHarness.invoke`, which calls one tool by name with its arguments as JSON.
- `standard_error_capture.ts`: `StandardErrorCapture.run`, which holds back the standard error while a piece of code runs and hands the test what was written.

## Rules
- `TemporaryFolder.remove` refuses any path `TemporaryFolder.make` did not make, so that a test cannot remove a folder it computed the path of by mistake.
- Nothing here holds state between test files. Every file gets its own process from the test runner, and a helper that remembered something across tests would make one test depend on another having run.
- `ToolHarness.invoke` hands the arguments to the tool as JSON rather than calling the function inside the tool, so that a tool whose schema no longer accepts what the test sends fails the test.

## Background
- The `./test_helpers/*` entry of the `exports` map carries the `development` condition only, and `files` in `package.json` ships `dist` alone. So these four files resolve while the repository is being worked on and are absent from the published package, which is what a test helper should be.
- `ToolHarness.invoke` gives back the text of an argument that the schema refused rather than throwing, because that is what the OpenAI Agents SDK does: it turns the refusal into a sentence for the model to read. `memory_tools_test.ts` asserts on that sentence.
