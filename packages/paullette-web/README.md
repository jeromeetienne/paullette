# paullette-web

The web interface of paullette. It starts a local web server and serves a conversation with the paullette agent in a browser.

```bash
npx paullette web
```

This package holds the web server, the routes, and the files sent to the browser. The agent it serves — the configuration, the `.paullette` folder reader, the history, the memory, and the tools — lives in [`paullette-core`](https://www.npmjs.com/package/paullette-core). The terminal interface lives in [`paullette`](https://www.npmjs.com/package/paullette).

The full documentation is in the [README of the repository](https://github.com/jeromeetienne/paullette#readme).

## Licence

MIT
