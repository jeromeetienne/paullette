import { z } from 'zod';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	model_context_protocol_types — the shape of a Model Context Protocol server entry
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The Zod schema of a server that paullette starts as a child process and talks to over the standard input and
 * the standard output.
 */
export const standardInputOutputServerSchema = z.object({
	/** The kind of transport. Claude Code writes `stdio` here, and leaves the field out when it is obvious. */
	type: z.literal('stdio').optional(),
	/** The program to run, for example `npx`. */
	command: z.string().min(1),
	/** The arguments given to the program. */
	args: z.array(z.string()).optional(),
	/** The environment variables added to the environment of the child process. */
	env: z.record(z.string(), z.string()).optional(),
	/** The folder the child process runs in. paullette falls back to the working folder when this is absent. */
	cwd: z.string().optional(),
});

/**
 * The Zod schema of a server paullette reaches over HTTP rather than starting itself.
 */
export const httpServerSchema = z.object({
	/** The kind of transport. `http` is the streamable HTTP transport, and `sse` is the older one. */
	type: z.union([z.literal('http'), z.literal('sse')]).optional(),
	/** The address of the server. */
	url: z.string().min(1),
	/** The headers sent with every request, which is where an authorisation header goes. */
	headers: z.record(z.string(), z.string()).optional(),
});

/**
 * The Zod schema of one entry of the `mcpServers` map. The entry that holds a `command` is a standard input and
 * output server, and the entry that holds a `url` is an HTTP server.
 */
export const serverEntrySchema = z.union([standardInputOutputServerSchema, httpServerSchema]);

/**
 * The Zod schema of a file that holds a `mcpServers` map, which is both the `.mcp.json` file and a settings file.
 *
 * Only the `mcpServers` field is read here. A settings file is allowed to hold anything else beside it, and
 * whatever else it holds is left alone.
 */
export const serversFileSchema = z.object({
	/** The map of the name of a server to the entry that says how to reach it. */
	mcpServers: z.record(z.string(), z.unknown()).optional(),
});

/**
 * One entry of the `mcpServers` map, already checked against the schema.
 */
export type ModelContextProtocolServerEntry = z.infer<typeof serverEntrySchema>;

/**
 * One Model Context Protocol server paullette was asked to use, kept next to the file it was declared in so that
 * a warning can say where a bad entry lives.
 */
export type ModelContextProtocolServerDefinition = {
	/** The name of the server, which is the key of the entry in the `mcpServers` map. */
	name: string;
	/** How to reach the server. */
	entry: ModelContextProtocolServerEntry;
	/** The absolute path of the file this entry was read from. */
	filePath: string;
};

/**
 * One sentence saying that something about the Model Context Protocol did not work, and that paullette carried
 * on without it.
 */
export type ModelContextProtocolWarning = {
	/** The name of the server the warning is about, or null when the warning is about a whole file. */
	serverName: string | null;
	/** The sentence shown to the user. */
	message: string;
};

/**
 * What `ModelContextProtocolConfigReader.readAll` found.
 */
export type ModelContextProtocolConfigReadResult = {
	/** Every server that was declared, with the name of a server appearing at most once. */
	serverDefinitions: ModelContextProtocolServerDefinition[];
	/** Every file that could not be read, and every entry that did not match the schema. */
	warnings: ModelContextProtocolWarning[];
};
