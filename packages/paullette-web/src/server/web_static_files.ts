import Fs from 'node:fs';
import Path from 'node:path';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebStaticFiles — serves the page, the stylesheet, and the script out of public/
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One file the browser may ask for, and what it is.
 *
 * The list is written out rather than read from the folder, so that a path arriving from a web address can never
 * reach a file that was not meant to be sent. There is no path to resolve and nothing to climb out of.
 */
const SERVED_FILES: Record<string, { fileName: string; contentType: string }> = {
	'/': {
		fileName: 'index.html',
		contentType: 'text/html; charset=utf-8',
	},
	'/index.html': {
		fileName: 'index.html',
		contentType: 'text/html; charset=utf-8',
	},
	'/paullette.css': {
		fileName: 'paullette.css',
		contentType: 'text/css; charset=utf-8',
	},
	'/paullette.js': {
		fileName: 'paullette.js',
		contentType: 'text/javascript; charset=utf-8',
	},
};

/**
 * One file, ready to be written to the browser.
 */
export type StaticFile = {
	/** What the file is, for the `content-type` header. */
	contentType: string;
	/** The bytes of the file. */
	content: Buffer;
};

/**
 * Serves the page, the stylesheet, and the script out of `public/`.
 */
export class WebStaticFiles {
	/**
	 * The absolute path of the `public/` folder of this package.
	 *
	 * It is worked out from the folder this file sits in. That resolves the same way whether the server runs
	 * from `src/` during development or from `dist/` once published, because `public/` sits beside both of them,
	 * one level below the root of the package.
	 *
	 * @returns The absolute path of the `public/` folder.
	 */
	static folderPath(): string {
		return Path.join(import.meta.dirname, '..', '..', 'public');
	}

	/**
	 * Reads the file a browser asked for.
	 *
	 * @param pathName The path of the request, with no query string.
	 * @returns The file, or null when nothing is served at that path.
	 */
	static read(pathName: string): StaticFile | null {
		const served = SERVED_FILES[pathName];
		if (served === undefined) {
			return null;
		}

		const filePath = Path.join(WebStaticFiles.folderPath(), served.fileName);
		if (Fs.existsSync(filePath) === false) {
			return null;
		}

		return {
			contentType: served.contentType,
			content: Fs.readFileSync(filePath),
		};
	}
}
