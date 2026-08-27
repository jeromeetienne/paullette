# Directory Context: `/test/libs`

## Purpose
Holds the individual verification checks, the helper that starts code-agent without a terminal, and the probe that asks the endpoint whether it is alive.

## Key Exports & Entry Points
- `verification_steps.ts`: `VerificationSteps.buildAll()`, the ordered list of checks. This is the only file `run_verification.ts` imports.
- `verification_types.ts`: `VerificationStep`, `VerificationResult`, `VerificationResults`, and `ListOutput`, which is the contract of the `--list` option of code-agent.
- `verification_checks_static.ts`: the checks that never call the model. They run in seconds.
- `verification_checks_model.ts`: the checks that call the model. They run in minutes.
- `verification_helpers.ts`: the reading and reporting shared by both check files.
- `code_agent_runner.ts`: `CodeAgentRunner`, which starts code-agent as a separate process and makes the temporary folders.
- `endpoint_probe.ts`: `EndpointProbe.check()`, which asks the endpoint for its model list.

## Rules
- A new check goes into `verification_checks_static.ts` when it does not call the model, and into `verification_checks_model.ts` when it does. It is then added to `verification_steps.ts` with the number of the plan step it carries out. Splitting the checks this way is what makes `npm run verify:fast` possible.
- Every check calls `VerificationHelpers.pendingWhenNotReady` before it looks at anything, so that a part of code-agent that is not written yet reports PENDING rather than a failure that reads like a bug.
- Every check that makes a temporary folder removes it in a `finally` block, so that a thrown error does not leave folders behind.
- `CodeAgentRunner.run` closes the standard input of code-agent. The check that a file write is refused without `--yes` depends on that, because it is what makes code-agent see that there is no terminal to ask.

## Background
- The base address and the model name are read from `CODE_AGENT_BASE_URL` and `CODE_AGENT_MODEL` in `verification_helpers.ts`, falling back to the same defaults code-agent itself uses. Setting either variable is how a check is rerun against a stronger model when a small model picks its tools badly.
