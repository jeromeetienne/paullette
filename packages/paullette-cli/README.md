# paullette

A coding agent for the command line. It reads a `.paullette` folder, and it runs on any endpoint that speaks the OpenAI API, including a local one.

```bash
npx paullette
```

This package holds the terminal interface and the command line entry point. Everything under it — the agent, the configuration, the `.paullette` folder reader, the history, the memory, and the tools — lives in [`paullette-core`](https://www.npmjs.com/package/paullette-core).

The full documentation is in the [README of the repository](https://github.com/jeromeetienne/paullette#readme).

## Licence

MIT
