import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { describe, test } from 'node:test';

import { WebStaticFiles } from '../../src/server/web_static_files.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	web_static_files_test — checks the three files are served and nothing else is
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('WebStaticFiles.folderPath', () => {
	test('points at a folder that holds the three files sent to the browser', () => {
		const folderPath = WebStaticFiles.folderPath();

		Assert.equal(Fs.existsSync(folderPath), true, `${folderPath} should exist`);
		Assert.equal(Path.basename(folderPath), 'public');
		Assert.equal(Fs.existsSync(Path.join(folderPath, 'index.html')), true);
		Assert.equal(Fs.existsSync(Path.join(folderPath, 'paullette.css')), true);
		Assert.equal(Fs.existsSync(Path.join(folderPath, 'paullette.js')), true);
	});
});

describe('WebStaticFiles.read', () => {
	test('serves the page at the root of the address', () => {
		const staticFile = WebStaticFiles.read('/');

		Assert.notEqual(staticFile, null);
		Assert.equal(staticFile?.contentType, 'text/html; charset=utf-8');
		Assert.match(staticFile?.content.toString('utf8') ?? '', /<title>paullette<\/title>/);
	});

	test('serves the stylesheet and the script under the names the page asks for', () => {
		Assert.equal(WebStaticFiles.read('/paullette.css')?.contentType, 'text/css; charset=utf-8');
		Assert.equal(WebStaticFiles.read('/paullette.js')?.contentType, 'text/javascript; charset=utf-8');
	});

	test('serves nothing at a path that is not one of the four written out in the file', () => {
		Assert.equal(WebStaticFiles.read('/package.json'), null);
		Assert.equal(WebStaticFiles.read('/paullette.css.map'), null);
		Assert.equal(WebStaticFiles.read(''), null);
	});

	test('serves nothing for a path that tries to climb out of the folder', () => {
		Assert.equal(WebStaticFiles.read('/../package.json'), null);
		Assert.equal(WebStaticFiles.read('/../../../../etc/passwd'), null);
		Assert.equal(WebStaticFiles.read('/public/../package.json'), null);
	});
});
