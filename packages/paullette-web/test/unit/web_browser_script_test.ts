import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { describe, test } from 'node:test';

import { WebBrowserScript } from '../../src/server/web_browser_script.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	web_browser_script_test — checks the TypeScript of the page becomes JavaScript a browser runs
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('WebBrowserScript.folderPath', () => {
	test('points at the folder the TypeScript of the browser sits in', () => {
		const folderPath = WebBrowserScript.folderPath();

		Assert.equal(Fs.existsSync(Path.join(folderPath, 'chat_page.ts')), true);
		Assert.equal(Path.basename(folderPath), 'src');
	});
});

describe('WebBrowserScript.read', () => {
	test('gives back the script with every type taken out and every line where it was', () => {
		const javaScript = WebBrowserScript.read('chat_page');
		const typeScript = Fs.readFileSync(Path.join(WebBrowserScript.folderPath(), 'chat_page.ts'), 'utf8');

		Assert.notEqual(javaScript, null);
		Assert.equal(javaScript?.includes('import type'), false, 'the type import must be gone');
		Assert.equal(javaScript?.includes(': HTMLElement'), false, 'the type annotations must be gone');
		Assert.match(javaScript ?? '', /class ChatPage/);
		Assert.equal(
			javaScript?.split('\n').length,
			typeScript.split('\n').length + 2,
			'every line must stay where it is, beside the two the source name is written on',
		);
	});

	test('names the TypeScript it was made from, so that a browser can show it', () => {
		Assert.match(WebBrowserScript.read('chat_page') ?? '', /\/\/# sourceURL=\/src\/chat_page\.ts/);
	});

	test('gives back nothing for a script that does not exist', () => {
		Assert.equal(WebBrowserScript.read('there-is-no-such-script'), null);
	});

	test('gives back nothing for a name that tries to climb out of the folder', () => {
		Assert.equal(WebBrowserScript.read('../../../package'), null);
		Assert.equal(WebBrowserScript.read('../index'), null);
	});
});
