import Fs from 'node:fs';
import Path from 'node:path';

import { FrontmatterParser } from '../config_folder/frontmatter_parser.ts';
import { memoryEntryTypeSchema, memoryFrontmatterSchema, type MemoryEntry, type MemoryEntryType } from './memory_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	MemoryStore — reads and writes .paullette/memory and keeps its index in step
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The name of the file that lists every remembered fact.
 */
const INDEX_FILE_NAME = 'MEMORY.md';

/**
 * The heading at the top of the index file.
 */
const INDEX_HEADING = '# Memory';

/**
 * Reads and writes `.paullette/memory`, and keeps `MEMORY.md` in step with the files beside it.
 *
 * One fact lives in one file. The index holds one line per file, and that index is what goes into the system
 * prompt, so that the agent can see what it knows without every fact being in the prompt at once.
 */
export class MemoryStore {
	/** The absolute path of the `.paullette/memory` folder. */
	private readonly _memoryFolderPath: string;

	/**
	 * Builds the memory store.
	 *
	 * @param memoryFolderPath The absolute path of the `.paullette/memory` folder.
	 */
	constructor(memoryFolderPath: string) {
		this._memoryFolderPath = memoryFolderPath;
	}

	/**
	 * Reads the index, which is what goes into the system prompt.
	 *
	 * @returns The whole text of `MEMORY.md`, or null when nothing has been remembered yet.
	 */
	readIndex(): string | null {
		const indexFilePath = Path.join(this._memoryFolderPath, INDEX_FILE_NAME);
		if (Fs.existsSync(indexFilePath) === false) {
			return null;
		}

		const text = Fs.readFileSync(indexFilePath, 'utf8').trim();
		return text.length === 0 ? null : text;
	}

	/**
	 * Reads every remembered fact.
	 *
	 * @returns Every fact, in the order of their names.
	 */
	listAll(): MemoryEntry[] {
		if (Fs.existsSync(this._memoryFolderPath) === false) {
			return [];
		}

		const fileNames = Fs.readdirSync(this._memoryFolderPath).filter((fileName) => {
			return fileName.endsWith('.md') === true && fileName !== INDEX_FILE_NAME;
		});

		const entries: MemoryEntry[] = [];
		for (const fileName of fileNames.sort()) {
			const entry = this._readFile(Path.join(this._memoryFolderPath, fileName));
			if (entry !== null) {
				entries.push(entry);
			}
		}

		return entries;
	}

	/**
	 * Reads one remembered fact by name.
	 *
	 * @param name The name of the fact.
	 * @returns The fact, or null when there is none by that name.
	 */
	read(name: string): MemoryEntry | null {
		const filePath = Path.join(this._memoryFolderPath, `${MemoryStore.toFileName(name)}.md`);
		if (Fs.existsSync(filePath) === false) {
			return null;
		}

		return this._readFile(filePath);
	}

	/**
	 * Writes one remembered fact and puts it in the index, replacing any fact of the same name.
	 *
	 * The index is rewritten from the files each time rather than being appended to, so that the index cannot
	 * drift away from what is actually on disk.
	 *
	 * @param name The name of the fact.
	 * @param description One line saying what the fact is.
	 * @param type What kind of thing the fact is.
	 * @param body The fact itself.
	 * @returns The absolute path of the file that was written.
	 */
	write(name: string, description: string, type: MemoryEntryType, body: string): string {
		Fs.mkdirSync(this._memoryFolderPath, {
			recursive: true,
		});

		const fileName = MemoryStore.toFileName(name);
		const filePath = Path.join(this._memoryFolderPath, `${fileName}.md`);

		const fileText = [
			'---',
			`name: ${fileName}`,
			`description: ${JSON.stringify(description)}`,
			'metadata:',
			'  node_type: memory',
			`  type: ${type}`,
			'---',
			'',
			body.trim(),
			'',
		].join('\n');

		Fs.writeFileSync(filePath, fileText, 'utf8');
		this._rewriteIndex();
		return filePath;
	}

	/**
	 * Forgets one remembered fact and takes it out of the index.
	 *
	 * @param name The name of the fact.
	 * @returns True when a file was removed, and false when there was none by that name.
	 */
	delete(name: string): boolean {
		const filePath = Path.join(this._memoryFolderPath, `${MemoryStore.toFileName(name)}.md`);
		if (Fs.existsSync(filePath) === false) {
			return false;
		}

		Fs.unlinkSync(filePath);
		this._rewriteIndex();
		return true;
	}

	/**
	 * Turns whatever name the model chose into a file name that is safe and predictable.
	 *
	 * @param name The name of the fact.
	 * @returns The file name without its extension: lower case, with hyphens instead of anything else.
	 */
	static toFileName(name: string): string {
		const cleaned = name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');

		return cleaned.length === 0 ? 'untitled' : cleaned;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads one memory file.
	 *
	 * @param filePath The absolute path of the file.
	 * @returns The fact, or null when the file holds nothing usable.
	 */
	private _readFile(filePath: string): MemoryEntry | null {
		const parsed = FrontmatterParser.parse(Fs.readFileSync(filePath, 'utf8'));
		const frontmatterResult = memoryFrontmatterSchema.safeParse(parsed.frontmatter);
		const frontmatter = frontmatterResult.success === true ? frontmatterResult.data : {};

		if (parsed.body.length === 0) {
			return null;
		}

		const name = frontmatter.name ?? Path.basename(filePath, '.md');
		const typeResult = memoryEntryTypeSchema.safeParse(frontmatter.metadata?.type);

		return {
			name: name,
			description: frontmatter.description ?? name,
			type: typeResult.success === true ? typeResult.data : 'project',
			body: parsed.body,
			filePath: filePath,
		};
	}

	/**
	 * Rewrites `MEMORY.md` from the files that are actually there.
	 *
	 * @returns Nothing.
	 */
	private _rewriteIndex(): void {
		const entries = this.listAll();
		const lines = entries.map((entry) => `- [${entry.name}](${entry.name}.md) — ${entry.description}`);
		const indexText = [INDEX_HEADING, '', ...lines, ''].join('\n');

		Fs.writeFileSync(Path.join(this._memoryFolderPath, INDEX_FILE_NAME), indexText, 'utf8');
	}
}
