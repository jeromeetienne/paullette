# Directory Context: `/test`

## Purpose
Holds the verification runner, which is the single command that answers whether paullette is done. It starts paullette as a separate process and looks only at what paullette printed and at the files it left behind, so it belongs to no single package and stays at the root of the repository. The other half of the testing is the unit test suite, which lives inside each package: [`/packages/paullette-core/test/unit`](../packages/paullette-core/test/unit/CONTEXT.md) and [`/packages/paullette-cli/test/unit`](../packages/paullette-cli/test/unit/CONTEXT.md). Each check in the verification runner carries out one numbered step of the verification section of the plan in [issue #1](https://github.com/jeromeetienne/paullette/issues/1).

## Key Exports & Entry Points
- `run_verification.ts`: the runner. It prints one scoreboard and exits with a status that says what happened.
- `libs/`: the checks themselves, the helper that starts paullette, and the endpoint probe — see its own CONTEXT.md.
- `fixture/`: the folder every check starts from. It is copied to a temporary folder before each check, never used in place. It holds a `.paullette` folder with one instruction document, one subagent, one slash command, and one skill.
- Command to run this folder: `npm test`, which runs `npm run test:unit` and then `npm run verify`. `npm run test:unit` runs the unit test suite of every package, and `npm run verify:fast` runs only the checks that do not call the model.

## Rules
- Nothing in `run_verification.ts` or in `libs/` imports from `paullette-core` or from `paullette`. A check starts paullette as a separate process and looks only at what paullette printed and at the files it left behind, so that a check cannot pass by reaching inside code that a real user never reaches. The unit test suite of each package is the opposite by design: it calls the code of its own package directly.
- A check never writes into the repository. It writes into a temporary folder made by `PaulletteRunner`, and `removeFolder` refuses any path that class did not make.
- The three outcomes mean three different things and must not be blurred. `passed` means something was really seen. `failed` means code that exists is wrong. `pending` means the part of paullette being checked has not been written yet.
- The exit status follows the same three meanings: zero when every check passed, one when any check failed, two when nothing failed but work remains.
- A check that calls the model proves its point with a word that exists in exactly one place, so the word can only reach the answer through the path being checked. Never assert on wording a model chose freely.
- Every check that calls the model sets `isModelNeeded` to true in `libs/verification_steps.ts`, which is what `--fast` filters on.

## Background
- The shape paullette must print for the `--list` option is written down as the `ListOutput` type in `libs/verification_types.ts`. That type is the contract, and it is kept next to the only code that reads it.
- The endpoint check runs before every check that calls the model because a dead local server makes all of those fail at once in a way that says nothing about the code. This is not hypothetical: an Ollama server quit by itself during the session that produced the plan.
- Every check that calls the model asks `VerificationHelpers.pendingWhenCapabilityMissing` what paullette can do before it judges what paullette did. Without that, a check can pass for the wrong reason — see the note at the end of `TODO.md` for the one that did.
