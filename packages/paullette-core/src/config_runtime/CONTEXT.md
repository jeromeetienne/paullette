# Directory Context: `/packages/paullette-core/src/config_runtime`

## Purpose
Settles the configuration paullette runs with — the endpoint, the model, the key, and the largest number of model turns — out of the command line, the environment, and the defaults, and reads the version of paullette out of its own `package.json`.

## Key Exports & Entry Points
- `config_loader.ts`: `ConfigLoader.load()`, which returns the settled configuration.
- `config_types.ts`: `PaulletteConfig` and the Zod schema behind it.
- `package_version_reader.ts`: `PackageVersionReader.read()`, which returns the version printed by the `--version` option, or `unknown` when no `package.json` could be read.

## Rules
- The three sources are read in one fixed order, the command line first, then the environment, then the defaults, so that the answer to "why is it talking to that endpoint" is always the same walk down one list.
- Nothing here asks the user anything or calls the model. It reads what it was given and returns a value.
- `PackageVersionReader` walks up from its own file until it finds a `package.json`, so the version is the same whether paullette runs from the TypeScript source or from the built JavaScript.

## Background
- Because `PackageVersionReader` walks up from its own file, it reports the version of `paullette-core`, not the version of `paullette`. The two are the same number by rule: every package of the repository carries one version and they are bumped together. See [`/packages/CONTEXT.md`](../../../CONTEXT.md).
