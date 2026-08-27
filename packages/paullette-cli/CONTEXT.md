# Directory Context: `/packages/paullette-cli`

## Purpose
The package named `paullette`. It is the terminal interface and the command line entry point, and it is what `npx paullette` runs. The folder is named after what the package is; the package inside keeps the published name `paullette`, so that the command a person types does not change.

## Key Exports & Entry Points
- `src/cli.ts`: the command line entry point, and the `bin` entry named `paullette`. It parses the command line, builds everything paullette needs, and then hands over to the mode that was asked for, which is either a terminal mode or the `web` command.
- `src/terminal/`: everything that talks to the person at the terminal — see its own CONTEXT.md.
- `test/unit/`: the unit test suite of this package — see its own CONTEXT.md.
- Command to run this folder: `npm start` at the root of the repository, which runs `tsx --conditions=development ./src/cli.ts`.

## Rules
- `src/terminal/` never imports from the `paullette-web` package. Only `src/cli.ts` may, and only to hand over: it imports `WebInterface` and `WebPermissionAsker` and nothing else, because handing over to a mode is what `cli.ts` is for and holding the logic of the other front end is what it must never do.
- Everything this package takes from `paullette-core` and from `paullette-web` is imported by the package name, for example `paullette-core/tools/tool_registry`, never through a relative path that climbs out of this folder.
- The program itself carries an action handler, even an empty one. Without it, Commander treats a program that has a command as a program that must be given one, and answers `paullette --list` with the help text.
- The `bin` entry points at `dist/cli.js`, so a published install runs the built JavaScript and resolves `paullette-core` to the built JavaScript of that package as well.

## Background
- The `--conditions=development` flag is what makes the development run resolve `paullette-core` to its TypeScript source instead of to a `dist` folder that may not have been built. Without it, `npm start` would need a build first. See the plan on [issue #4](https://github.com/jeromeetienne/paullette/issues/4).
- The listener that stops the web server is registered with `process.on` and not `process.once`. The OpenAI Agents SDK registers a `SIGINT` handler of its own that calls `process.exit(130)` unless another listener is still registered when it looks, and a `once` listener has already removed itself by then. See the plan on [issue #9](https://github.com/jeromeetienne/paullette/issues/9).
