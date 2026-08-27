import Fs from 'node:fs';
import Module from 'node:module';
import Path from 'node:path';

import Express from 'express';

import { WebStaticFiles } from './web_static_files.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebBrowserScript — serves public/chat/src/*.ts as the JavaScript a browser runs
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The script of the page is written in TypeScript, in `public/chat/src/`, and a browser runs JavaScript. This
 * class is the one step between the two.
 *
 * The types are taken out by `stripTypeScriptTypes` of Node.js, which replaces each one with as many spaces as
 * it took, so every line and every column of the JavaScript sent to the browser is where it is in the
 * TypeScript. Nothing is compiled and nothing is built: there is no step to forget and no file that can go
 * stale beside its source. What it costs is that the TypeScript has to be the kind types can be taken out of,
 * with no `enum` and no `namespace` in it, and that Node.js says once, on the first page a browser opens, that
 * `stripTypeScriptTypes` is still an experimental feature.
 */
export class WebBrowserScript {
	/**
	 * The absolute path of the folder the TypeScript of the browser sits in.
	 *
	 * @returns The absolute path of `public/chat/src/`.
	 */
	static folderPath(): string {
		return Path.join(WebStaticFiles.chatFolderPath(), 'src');
	}

	/**
	 * Reads one script and gives back the JavaScript a browser runs.
	 *
	 * @param scriptName The name of the script without its extension, for example `chat_page`.
	 * @returns The JavaScript, or null when there is no such script.
	 */
	static read(scriptName: string): string | null {
		const folderPath = WebBrowserScript.folderPath();
		const filePath = Path.join(folderPath, `${scriptName}.ts`);

		if (filePath.startsWith(folderPath + Path.sep) === false) {
			return null;
		}

		if (Fs.existsSync(filePath) === false) {
			return null;
		}

		const typeScript = Fs.readFileSync(filePath, 'utf8');

		return Module.stripTypeScriptTypes(typeScript, {
			mode: 'strip',
			sourceUrl: `/src/${scriptName}.ts`,
		});
	}

	/**
	 * The router mounted at `/js`, which answers `/js/<script name>.js` with the JavaScript of
	 * `public/chat/src/<script name>.ts`.
	 *
	 * The answer is never stored by the browser, because the TypeScript it is made from is read again on every
	 * request. Editing the script and reloading the page is the whole of what it takes to see the change.
	 *
	 * @returns The router to mount.
	 */
	static router(): Express.Router {
		const router = Express.Router();

		router.get('/:scriptName.js', (request, response, next) => {
			const javaScript = WebBrowserScript.read(request.params.scriptName);

			if (javaScript === null) {
				next();
				return;
			}

			response.set('cache-control', 'no-store');
			response.type('text/javascript; charset=utf-8').send(javaScript);
		});

		return router;
	}
}
