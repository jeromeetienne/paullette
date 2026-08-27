import { z } from 'zod';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	memory_types — the shape of one remembered fact
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * What kind of thing a remembered fact is.
 *
 * - `user` says who the person is: their role, what they know, what they prefer.
 * - `feedback` is guidance the person gave about how to work, including why.
 * - `project` is something about the work in hand that the code and the history do not already say.
 * - `reference` is a pointer to something outside, such as an address or a ticket.
 */
export const memoryEntryTypeSchema = z.enum(['user', 'feedback', 'project', 'reference']);

/**
 * What kind of thing a remembered fact is.
 */
export type MemoryEntryType = z.infer<typeof memoryEntryTypeSchema>;

/**
 * The Zod schema of the frontmatter of a memory file. It matches the frontmatter Claude Code writes, so that the
 * same folder can be read by both.
 */
export const memoryFrontmatterSchema = z.object({
	/** The short name of the fact, which is also the name of its file without the extension. */
	name: z.string().optional(),
	/** One line saying what the fact is, used to decide whether the file is worth reading. */
	description: z.string().optional(),
	/** Everything else recorded about the fact, including what kind of thing it is. */
	metadata: z
		.object({
			node_type: z.string().optional(),
			type: z.string().optional(),
		})
		.optional(),
});

/**
 * One remembered fact.
 */
export type MemoryEntry = {
	/** The short name of the fact, in lower case with hyphens, which is also its file name. */
	name: string;
	/** One line saying what the fact is. This is what goes in the index, and what the agent reads to decide. */
	description: string;
	/** What kind of thing the fact is. */
	type: MemoryEntryType;
	/** The fact itself. */
	body: string;
	/** The absolute path of the file the fact is kept in. */
	filePath: string;
};
