import { tool } from '@openai/agents';
import { z } from 'zod';

import { MemoryStore } from '../memory/memory_store.ts';
import { memoryEntryTypeSchema } from '../memory/memory_types.ts';
import { ToolPaths } from './tool_paths.ts';
import { type ToolContext } from './tool_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	MemoryTools — lets the agent remember, recall, and forget things between sessions
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Lets the agent remember, recall, and forget things between sessions.
 */
export class MemoryTools {
	/**
	 * Builds every memory tool.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @param memoryStore The store the tools read and write.
	 * @returns The memory tools.
	 */
	static createAll(context: ToolContext, memoryStore: MemoryStore) {
		return [
			MemoryTools._createMemoryList(context, memoryStore),
			MemoryTools._createMemoryRead(context, memoryStore),
			MemoryTools._createMemoryWrite(context, memoryStore),
			MemoryTools._createMemoryDelete(context, memoryStore),
		];
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Individual Tools
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds the tool that lists everything remembered.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @param memoryStore The store the tool reads.
	 * @returns The tool.
	 */
	private static _createMemoryList(context: ToolContext, memoryStore: MemoryStore) {
		return tool({
			name: 'memory_list',
			description: 'List everything remembered about this project, as a name and a line about each.',
			parameters: z.object({}),
			execute: async () => {
				context.logToolCall('memory_list', 'everything');

				const entries = memoryStore.listAll();
				if (entries.length === 0) {
					return 'Nothing has been remembered about this project yet.';
				}

				const lines = entries.map((entry) => `- ${entry.name} (${entry.type}): ${entry.description}`);
				return ToolPaths.capOutput(lines.join('\n'));
			},
		});
	}

	/**
	 * Builds the tool that reads one remembered fact.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @param memoryStore The store the tool reads.
	 * @returns The tool.
	 */
	private static _createMemoryRead(context: ToolContext, memoryStore: MemoryStore) {
		return tool({
			name: 'memory_read',
			description: 'Read one remembered fact in full, by its name.',
			parameters: z.object({
				name: z.string().describe('The name of the fact to read, as shown by memory_list or in the index.'),
			}),
			execute: async ({ name }) => {
				context.logToolCall('memory_read', name);

				const entry = memoryStore.read(name);
				if (entry === null) {
					return `Nothing is remembered under the name ${name}.`;
				}

				return ToolPaths.capOutput(entry.body);
			},
		});
	}

	/**
	 * Builds the tool that remembers something, asking the user first.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @param memoryStore The store the tool writes to.
	 * @returns The tool.
	 */
	private static _createMemoryWrite(context: ToolContext, memoryStore: MemoryStore) {
		return tool({
			name: 'memory_write',
			description:
				'Remember one thing for later sessions. Use this when the user asks you to remember something, ' +
				'or tells you how they want you to work. Remember one fact per call, and do not remember what ' +
				'the code or the history of the project already says.',
			parameters: z.object({
				name: z.string().describe('A short name for the fact, in lower case with hyphens.'),
				description: z.string().describe('One line saying what the fact is, shown in the index.'),
				type: memoryEntryTypeSchema.describe(
					'user for who the person is, feedback for how they want you to work, project for the work ' +
						'in hand, reference for a pointer to something outside.',
				),
				body: z.string().describe('The fact itself, written so that a later session can act on it.'),
			}),
			execute: async ({ name, description, type, body }) => {
				context.logToolCall('memory_write', name);

				const decision = await context.permissionAsker.ask({
					toolName: 'memory_write',
					summary: `remember "${description}" as ${MemoryStore.toFileName(name)}`,
					detail: body,
				});

				if (decision === 'refused') {
					return 'The user refused to let you remember that. Do not try again.';
				}

				const filePath = memoryStore.write(name, description, type, body);
				return `Remembered that, in ${filePath}, and added it to the index.`;
			},
		});
	}

	/**
	 * Builds the tool that forgets something, asking the user first.
	 *
	 * @param context The working folder, the permission asker, and the tool call logger.
	 * @param memoryStore The store the tool writes to.
	 * @returns The tool.
	 */
	private static _createMemoryDelete(context: ToolContext, memoryStore: MemoryStore) {
		return tool({
			name: 'memory_delete',
			description: 'Forget one remembered fact, by its name. Use this when a remembered fact turns out to be wrong.',
			parameters: z.object({
				name: z.string().describe('The name of the fact to forget.'),
			}),
			execute: async ({ name }) => {
				context.logToolCall('memory_delete', name);

				const decision = await context.permissionAsker.ask({
					toolName: 'memory_delete',
					summary: `forget ${MemoryStore.toFileName(name)}`,
					detail: memoryStore.read(name)?.body,
				});

				if (decision === 'refused') {
					return 'The user refused to let you forget that. Do not try again.';
				}

				const wasRemoved = memoryStore.delete(name);
				return wasRemoved === true
					? `Forgot ${name} and took it out of the index.`
					: `Nothing is remembered under the name ${name}.`;
			},
		});
	}
}
