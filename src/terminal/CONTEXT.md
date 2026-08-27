# Directory Context: `/src/terminal`

## Purpose
Everything that talks to the person at the terminal: asking permission, reading what they type, and printing what the agent says.

## Key Exports & Entry Points
- `permission_prompt.ts`: `PermissionPrompt`, which implements the `PermissionAsker` interface from `tools/tool_types.ts`.

## Rules
- This folder may import from `tools/`, but `tools/` must never import from here. The dependency runs one way so that a tool can be used without a terminal.
- Everything paullette says about its own working goes to the standard error. The standard output carries only the answer of the model, so that a caller reading the standard output gets the answer on its own.
- `PermissionPrompt` refuses when there is no terminal to ask at. That is the safe direction: paullette running from a script or from a check must never change a file that nobody approved.
- Only one thing reads the terminal at a time. When the interactive loop owns a readline interface it hands it to `PermissionPrompt.setReadlineInterface`, rather than a second interface being opened behind its back.

## Background
- An "always allow" answer is remembered for the session only and never written to disk, so that approving something once cannot silently approve it in a later run.
