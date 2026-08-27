# Directory Context: `/test`

## Purpose
Holds the verification runner, which is the single command that answers whether code-agent is done. Each check here carries out one numbered step of the verification section of the plan in [issue #1](https://github.com/jeromeetienne/code-agent/issues/1).

## Key Exports & Entry Points
- `run_verification.ts`: the runner. It prints one scoreboard and exits with a status that says what happened.
- `libs/`: the checks themselves, the helper that starts code-agent, and the endpoint probe — see its own CONTEXT.md.
- `fixture/`: the folder every check starts from. It is copied to a temporary folder before each check, never used in place. It holds a `.code-agent` folder with one instruction document, one subagent, one slash command, and one skill.
- Command to run this folder: `npm run verify`, or `npm run verify:fast` to skip every check that calls the model.

## Rules
- Nothing here imports from `src/`. A check starts code-agent as a separate process and looks only at what code-agent printed and at the files it left behind, so that a check cannot pass by reaching inside code that a real user never reaches.
- A check never writes into the repository. It writes into a temporary folder made by `CodeAgentRunner`, and `removeFolder` refuses any path that class did not make.
- The three outcomes mean three different things and must not be blurred. `passed` means something was really seen. `failed` means code that exists is wrong. `pending` means the part of code-agent being checked has not been written yet.
- The exit status follows the same three meanings: zero when every check passed, one when any check failed, two when nothing failed but work remains.
- A check that calls the model proves its point with a word that exists in exactly one place, so the word can only reach the answer through the path being checked. Never assert on wording a model chose freely.
- Every check that calls the model sets `isModelNeeded` to true in `libs/verification_steps.ts`, which is what `--fast` filters on.

## Background
- The shape code-agent must print for the `--list` option is written down as the `ListOutput` type in `libs/verification_types.ts`. That type is the contract, and it is kept next to the only code that reads it.
- The endpoint check runs before every check that calls the model because a dead local server makes all of those fail at once in a way that says nothing about the code. This is not hypothetical: an Ollama server quit by itself during the session that produced the plan.
- Every check that calls the model asks `VerificationHelpers.pendingWhenCapabilityMissing` what code-agent can do before it judges what code-agent did. Without that, a check can pass for the wrong reason — see the note at the end of `TODO.md` for the one that did.
