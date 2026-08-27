import Fs from 'node:fs';
import Path from 'node:path';

import { type InstructionDocument } from './config_folder_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	InstructionLoader — reads the instruction document out of the .paullette folder
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The names looked for, in order. `CLAUDE.md` comes first because a `.paullette` folder is most often a copy of a
 * `.claude` folder, and `PAULLETTE.md` is accepted for a project that would rather not carry the other name.
 */
const INSTRUCTION_FILE_NAMES = ['CLAUDE.md', 'PAULLETTE.md'];

/**
 * Reads the instruction document out of the `.paullette` folder.
 */
export class InstructionLoader {
	/**
	 * Reads the instruction document.
	 *
	 * @param configFolderPath The absolute path of the `.paullette` folder.
	 * @returns The instruction document, or null when there is none.
	 */
	static load(configFolderPath: string): InstructionDocument | null {
		for (const fileName of INSTRUCTION_FILE_NAMES) {
			const filePath = Path.join(configFolderPath, fileName);
			if (Fs.existsSync(filePath) === false) {
				continue;
			}

			const text = Fs.readFileSync(filePath, 'utf8').trim();
			if (text.length === 0) {
				continue;
			}

			return {
				filePath: filePath,
				text: text,
			};
		}

		return null;
	}
}
