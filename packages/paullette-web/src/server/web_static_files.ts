import Path from 'node:path';
import Url from 'node:url';

import type Express from 'express';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebStaticFiles — where the files the browser is sent are on the disk
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Where every file the browser is sent sits on the disk of this machine.
 *
 * Nothing is read here. The reading is `express.static`, which `WebApplication` mounts on these folders; this
 * class only says where they are.
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
	static publicFolderPath(): string {
		return Path.join(import.meta.dirname, '..', '..', 'public');
	}

	/**
	 * The absolute path of the folder served at the root of the address: the page, its stylesheet, and the
	 * TypeScript of its script.
	 *
	 * @returns The absolute path of `public/chat/`.
	 */
	static chatFolderPath(): string {
		return Path.join(WebStaticFiles.publicFolderPath(), 'chat');
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
	 * The absolute path of the folder the stylesheet of Bootstrap sits in, which is what is mounted at
	 * `/vendor/bootstrap`.
	 *
	 * @returns The absolute path of `bootstrap/dist/css/`.
	 */
	static bootstrapStylesheetFolderPath(): string {
		return Path.dirname(WebStaticFiles.bootstrapStylesheetPath());
	}

	/**
	 * Names the TypeScript of the script as text, so that a browser shows it rather than offering to save it.
	 *
	 * The page asks for its script at `/js/chat_page.js`, and the JavaScript it is answered with names
	 * `/src/chat_page.ts` as where it was written. A browser that follows that name asks for a `.ts` file, and
	 * the table of file types every static file server carries reads `.ts` as a video stream.
	 *
	 * @param response The answer being written.
	 * @param filePath The absolute path of the file being sent.
	 * @returns Nothing.
	 */
	static nameTypeScriptAsText(response: Express.Response, filePath: string): void {
		if (Path.extname(filePath) === '.ts') {
			response.setHeader('content-type', 'text/plain; charset=utf-8');
		}
	}
}
