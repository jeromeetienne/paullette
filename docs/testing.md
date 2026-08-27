# Testing paullette

There are two suites. They cover different failures and neither replaces the other.

| Command | What it is | Needs a live endpoint? | How long |
| --- | --- | --- | --- |
| `npm run test:unit` | The unit tests of every package. Each one calls the code of its own package directly. | no | seconds |
| `npm run verify` | The verification runner. It starts paullette as a separate process and looks only at what paullette printed and at the files it left behind. | yes | minutes |
| `npm run verify:fast` | The verification steps that do not call the model. | no | seconds |
| `npm test` | `test:unit` and then `verify`, in that order. | yes | minutes |
| `npm run typecheck` | The TypeScript compiler over every package, emitting nothing. | no | seconds |

Nothing is done until `npm run typecheck` is clean, `npm run test:unit` passes, and `npm run verify` exits zero with every step reporting PASS.

## The unit tests

They live inside each package, next to the code they cover:

```
packages/paullette-core/test/unit/    one file per source file of paullette-core
packages/paullette-core/test/libs/    what the test files share
packages/paullette-web/test/unit/     the permission asker, the Markdown, the static files, and the router
packages/paullette-cli/test/unit/     the part of the terminal code that can be tested without a terminal
```

A test file is named after the source file it covers — `memory_store_test.ts` covers `memory_store.ts` — so the file to open is never in doubt.

They run on the Node.js test runner, through `node --import tsx --conditions=development --test`.

### The rules a unit test follows

- **It never calls a model and never reaches the network.** The whole suite runs in seconds and needs nothing running.
- **It never writes into the repository.** It writes into a folder made by `TemporaryFolder` and removes it in an `afterEach`. `TemporaryFolder.remove` refuses any path it did not make itself, so a test cannot delete a folder whose path it computed wrongly.
- **It never starts a web server on a fixed port.** The tests of `paullette-web` call the router, the permission asker, and the static file server directly, so two test runs at the same time cannot collide. Whether a whole turn really reaches a browser is asked by the verification runner instead, which is the only place that whole chain exists.
- **It never reads a constant out of the code it is testing to build the value it then asserts on.** A cap or a default is written out again in the test. Otherwise changing the code changes the test with it, and the test only ever agrees with itself.
- **It calls a tool through `ToolHarness.invoke`**, the way the software development kit calls it, with the arguments as JSON — so that the schema of the tool is part of what is tested, not only its body.
- **It wraps anything that prints to the standard error in `StandardErrorCapture.run`**, so the output of the test run stays readable.

### The shared helpers

Under `packages/paullette-core/test/libs/`. The unit tests of `paullette` reach them by the package name, through the `./test_helpers/*` entry of the `exports` map of `paullette-core`, never by a relative path that climbs out of the package. That entry carries the `development` condition only, so the helpers are absent from the published package.

| Helper | What it gives a test |
| --- | --- |
| `TemporaryFolder` | `make`, `remove`, and `writeFile`. A folder of its own, removed afterwards. |
| `FakePermissionAsker` | An asker that answers every request the same way and keeps every request it was given, so a test can check both the answer and what the tool said it was about to do. |
| `ToolHarness` | `makeContext` builds a `ToolContext` for a test; `invoke` calls one tool by name with its arguments as JSON. |
| `StandardErrorCapture` | `run` holds back the standard error while a piece of code runs, and hands the test what was written. |
| `FakeModelContextProtocolServer` | A Model Context Protocol server that answers from a list of tools written by the test and remembers every call that reached it. A unit test may not start a real server. |

`ToolHarness.invoke` gives back the text of an argument that the schema refused rather than throwing, because that is what the software development kit does: it turns the refusal into a sentence for the model to read.

### What the unit tests are good at

The edges, one case at a time: a path that climbs out of the working folder, frontmatter that is not valid YAML, a permission that was refused, a memory index that has to be rewritten, a `.mcp.json` that is not JSON. The verification runner cannot reach any of those one at a time.

They cannot say whether the whole chain works, because nothing in them starts paullette or calls a model.

## The verification runner

`npm run verify` is the single command that answers "is it done". It lives in `/test`, belongs to no package, and starts paullette as a separate process.

Each of its sixteen steps carries out one numbered step of a plan: fourteen from the verification section of the plan in [issue #1](https://github.com/jeromeetienne/paullette/issues/1), and two from the plan for the web interface in [issue #9](https://github.com/jeromeetienne/paullette/issues/9).

```
paullette verification  —  16 steps

PASS    typecheck            plan step 1  the compiler reported no error
PASS    endpoint             plan step 2  http://127.0.0.1:1234/v1 serves qwen3.5-4b
PASS    folderCreated        plan step 3  .paullette and its subfolders were created
...
16 passed, 0 failed, 0 pending
```

### The three outcomes mean three different things

They must never be blurred.

| Outcome | What it means |
| --- | --- |
| `passed` | Something was really seen. |
| `failed` | Code that exists is wrong. |
| `pending` | The part of paullette being checked has not been written yet. |

The exit status follows the same three meanings: **zero** when every check passed, **one** when any check failed, **two** when nothing failed but work remains.

### The capability line

Every check that calls the model first asks paullette what it can do, through `VerificationHelpers.pendingWhenCapabilityMissing`, which reads the line paullette writes to its standard error on every run:

```
paullette-capabilities: {"toolNames":[...],"hasMemory":true,"hasSessions":true,"hasWebInterface":true,"modelContextProtocolServerNames":["now"]}
```

That line exists because of a real false green. Before it, the check that a file write is refused **passed** — for the simple reason that there was no file writing tool at all. A check that passes while the thing it checks does not exist is the one failure this harness exists to prevent.

Its shape is the `PaulletteCapabilities` type in `test/libs/verification_types.ts`, and it is kept in step by hand, because nothing under `test/` may import from a package.

### The rules a verification step follows

- **It never imports from `paullette-core` or from `paullette`.** It starts paullette as a separate process and looks only at what paullette printed and at the files it left behind, so that a check cannot pass by reaching inside code a real user never reaches. The unit tests are the opposite by design.
- **It never writes into the repository.** It copies `test/fixture/` to a temporary folder made by `PaulletteRunner` and works there.
- **A check that calls the model proves its point with a word that exists in exactly one place**, so that word can only have reached the answer through the path being checked. Never assert on wording a model chose freely.
- **A check that calls the model sets `isModelNeeded: true`** in `test/libs/verification_steps.ts`, which is what `--fast` filters on.

### Why a check is tried more than once

Whether a model chooses to call a tool is not deterministic, so one sample does not settle what a check is asking. A check that calls the model is tried up to **three** times, and the attempt it passed on is printed whenever it took more than one — so a check that starts needing three attempts is visible rather than quietly flaky.

### Why the endpoint is checked first

A dead local server makes every check that calls the model fail at once, in a way that says nothing about the code. This is not hypothetical: an Ollama server quit by itself during the session that produced the plan.

### The fixture

`test/fixture/` holds a `.paullette` folder with one instruction document, one subagent, one slash command, and one skill. It is copied to a temporary folder before each check and never used in place.

## The endpoint

The verification runner needs an endpoint serving at the address paullette is configured with, and serving the configured model.

```bash
npm run lmstudio:start
```

```bash
npm run lmstudio:status
```

`PAULLETTE_MODEL` overrides which model both paullette and the runner ask for.

## Adding a test

**A new unit test.** Add `<source file name>_test.ts` under the `test/unit` of the package that holds the source file. Use `TemporaryFolder` for anything on disk, `ToolHarness` for a tool, and `FakePermissionAsker` for a permission. Write the constants you assert on out again rather than importing them.

**A new verification step.** Add an entry to `test/libs/verification_steps.ts` with its name, its title, the plan step it carries out, and `isModelNeeded`. Put the check itself in `verification_checks_static.ts` when it does not call the model, or in `verification_checks_model.ts` when it does. A check that calls the model asks `pendingWhenCapabilityMissing` first, and proves its point with a word that exists in exactly one place.

## What neither suite covers

**The interactive loop.** Nothing types at a terminal, so `/help`, `/exit`, the interrupt key, and the answer streaming out turn by turn are written but unchecked. Verifying them needs a pseudo terminal, because `_runInteractive` refuses to start when its input is not a terminal. Until that exists, treat the interactive loop as unproven however green the scoreboard looks.

**The Model Context Protocol servers, end to end.** The configuration reading and the tool conversion are covered by unit tests against a fake server, and the whole chain was proved live by hand against `npx -y mcp-now`, but no verification step declares a real server and watches the model call one of its tools.

The current state of both is tracked in [`/TODO.md`](../TODO.md).
