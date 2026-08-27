# Directory Context: `/packages`

## Purpose
Holds every package of this repository. The repository is an npm workspace, declared by the `workspaces` field of the `package.json` at the root, and each folder here is one package with its own `package.json`.

## Key Exports & Entry Points
- `paullette-core/`: the agent, the configuration, the `.paullette` folder reader, the history, the memory, and the tools, with no user interface — see its own CONTEXT.md.
- `paullette-cli/`: the terminal interface and the command line entry point. The package inside is named `paullette` and holds the `bin` entry named `paullette` — see its own CONTEXT.md.
- `paullette-web/`: the web interface, which `npx paullette web` starts. It depends on `paullette-core` in the same way `paullette` does — see its own CONTEXT.md.
- Command to run this folder: `npm run build` at the root of the repository, which builds `paullette-core`, then `paullette-web`, then `paullette`.

## Rules
- `paullette-core` never imports from `paullette` and never imports from `paullette-web`. The dependency runs one way, which is what lets a second front end sit on the same agent.
- `paullette-web` never imports from `paullette`. The other way round is allowed in one place only: `packages/paullette-cli/src/cli.ts` imports `WebInterface` from `paullette-web`, so that `npx paullette web` can hand over to it. `packages/paullette-cli/src/terminal/` never imports from `paullette-web`, so neither front end holds any of the other one.
- A package reaches another package by its name only. No file here is imported through a relative path that climbs out of the folder of its own package.
- Every package carries the same version number, and each package depends on the exact version of the packages below it. They are bumped in one step by `npm run publish:all`.

## Background
- The reason for the split, the shape of the `exports` map that makes one import specifier work in type checking, in a development run, and in a published run, and the live test that proved it, are written down in the plan on [issue #4](https://github.com/jeromeetienne/paullette/issues/4).
- `paullette-core` is not free of Node.js yet: `tools`, `history`, `memory`, and `config_folder` all read files through `node:fs`. The package boundary is drawn, the promise that `paullette-core` runs in a browser is not kept yet, and keeping it is its own piece of work. `paullette-web` does not need it kept: the whole of `paullette-web` runs in Node.js and only the three files in its `public/` folder reach a browser.
- The design of `paullette-web`, and the live test that proved a permission question can be answered from a second request while the turn is parked, are in the plan on [issue #9](https://github.com/jeromeetienne/paullette/issues/9).
