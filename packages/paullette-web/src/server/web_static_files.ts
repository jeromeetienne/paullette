import Fs from 'node:fs';
import Path from 'node:path';
import Url from 'node:url';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebStaticFiles — serves the page, the stylesheets, and the script
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One file the browser may ask for, and what it is.
 *
 * The list is written out rather than read from the folder, so that a path arriving from a web address can never
 * reach a file that was not meant to be sent. There is no path to resolve and nothing to climb out of.
 */
const SERVED_FILES: Record<string, { resolveFilePath: () => string; contentType: string }> = {
	'/': {
		resolveFilePath: () => Path.join(WebStaticFiles.folderPath(), 'index.html'),
		contentType: 'text/html; charset=utf-8',
	},
	'/index.html': {
		resolveFilePath: () => Path.join(WebStaticFiles.folderPath(), 'index.html'),
		contentType: 'text/html; charset=utf-8',
	},
	'/bootstrap.css': {
		resolveFilePath: () => WebStaticFiles.bootstrapStylesheetPath(),
		contentType: 'text/css; charset=utf-8',
	},
	'/paullette.css': {
		resolveFilePath: () => Path.join(WebStaticFiles.folderPath(), 'paullette.css'),
		contentType: 'text/css; charset=utf-8',
	},
	'/paullette.js': {
		resolveFilePath: () => Path.join(WebStaticFiles.folderPath(), 'paullette.js'),
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
 * Serves the page, the stylesheets, and the script.
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
	 * The absolute path of the stylesheet of Bootstrap, inside the `bootstrap` package.
	 *
	 * Bootstrap is a dependency of this package and is read off the disk of the machine paullette runs on, never
	 * fetched from a content delivery network. The server listens on the loopback address by default, and a page
	 * that needed the internet to look right would be wrong.
	 *
	 * @returns The absolute path of `bootstrap.min.css`.
	 */
	static bootstrapStylesheetPath(): string {
		return Url.fileURLToPath(import.meta.resolve('bootstrap/dist/css/bootstrap.min.css'));
	}

	/**
	 * Every path the browser may ask a file at.
	 *
	 * The router registers one route for each of them, so that Express matches a whole path against this list
	 * and never resolves a path from a web address against a folder.
	 *
	 * @returns The paths, in the order they are written out above.
	 */
	static servedPaths(): string[] {
		return Object.keys(SERVED_FILES);
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

		const filePath = served.resolveFilePath();
		if (Fs.existsSync(filePath) === false) {
			return null;
		}

		return {
			contentType: served.contentType,
			content: Fs.readFileSync(filePath),
		};
	}
}
