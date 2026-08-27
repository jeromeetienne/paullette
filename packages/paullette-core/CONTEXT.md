# Directory Context: `/packages/paullette-core`

## Purpose
The package named `paullette-core`. It holds everything paullette does that is not a user interface: building the agent, reading the configuration, reading the `.paullette` folder, keeping the history, keeping the memory, and every tool the agent can call.

## Key Exports & Entry Points
- `src/agent/`: turns the configuration into an agent the OpenAI Agents SDK can run — see its own CONTEXT.md.
- `src/config_folder/`: finds and reads the `.paullette` folder — see its own CONTEXT.md.
- `src/config_runtime/`: reads the configuration given on the command line and in the environment — see its own CONTEXT.md.
- `src/history/`: keeps the conversation and the lines the user typed — see its own CONTEXT.md.
- `src/memory/`: reads and writes `.paullette/memory` — see its own CONTEXT.md.
- `src/tools/`: every tool the agent can call — see its own CONTEXT.md.
- `test/unit/` and `test/libs/`: the unit test suite of this package and what it shares — see their own CONTEXT.md.
- Every file under `src/` is reachable from another package as `paullette-core/<folder>/<file name>`, without the `.ts` extension. There is no barrel file.
- Command to run this folder: `npm run test:unit --workspace paullette-core`.

## Rules
- Nothing here imports from the `paullette` package or from the `paullette-web` package.
- The `exports` map is the public interface of this package, and it is a wildcard over `src/`. A file is reached by its own path, never through an `index.ts`.
- The four test helpers under `test/libs/` are exposed as `paullette-core/test_helpers/*` under the `development` condition only, so they never reach the published package.

## Background
- The three entries of the `exports` map — `development`, `types`, and `default` — are what make one import specifier resolve to the TypeScript source while working, and to the built JavaScript once published. `customConditions: ["development"]` in `/tsconfig.base.json` is the type checking half of it, and `tsx --conditions=development` is the running half. This was proved live before it was built; see the plan on [issue #4](https://github.com/jeromeetienne/paullette/issues/4).
