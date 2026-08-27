# Directory Context: `/packages/paullette-cli`

## Purpose
The package named `paullette`. It is the terminal interface and the command line entry point, and it is what `npx paullette` runs. The folder is named after what the package is; the package inside keeps the published name `paullette`, so that the command a person types does not change.

## Key Exports & Entry Points
- `src/cli.ts`: the command line entry point, and the `bin` entry named `paullette`. It parses the command line, builds everything paullette needs, and then hands over to the mode that was asked for.
- `src/terminal/`: everything that talks to the person at the terminal — see its own CONTEXT.md.
- `test/unit/`: the unit test suite of this package — see its own CONTEXT.md.
- Command to run this folder: `npm start` at the root of the repository, which runs `tsx --conditions=development ./src/cli.ts`.

## Rules
- Nothing here imports from the `paullette-web` package.
- Everything this package takes from `paullette-core` is imported by the package name, for example `paullette-core/tools/tool_registry`, never through a relative path that climbs out of this folder.
- The `bin` entry points at `dist/cli.js`, so a published install runs the built JavaScript and resolves `paullette-core` to the built JavaScript of that package as well.

## Background
- The `--conditions=development` flag is what makes the development run resolve `paullette-core` to its TypeScript source instead of to a `dist` folder that may not have been built. Without it, `npm start` would need a build first. See the plan on [issue #4](https://github.com/jeromeetienne/paullette/issues/4).
