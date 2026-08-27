# paullette-core

The part of [paullette](https://github.com/jeromeetienne/paullette) that has no user interface: building the agent, reading the configuration, reading the `.paullette` folder, keeping the history, keeping the memory, and every tool the agent can call.

Depend on this package when you want the agent without the command line interface. If you want the command line interface, install [`paullette`](https://www.npmjs.com/package/paullette) instead.

Every file is reached by its own path, and there is no barrel file:

```ts
import { ToolRegistry } from 'paullette-core/tools/tool_registry';
import { ConfigFolderReader } from 'paullette-core/config_folder/config_folder_reader';
```

The full documentation is in the [README of the repository](https://github.com/jeromeetienne/paullette#readme).

## Licence

MIT
