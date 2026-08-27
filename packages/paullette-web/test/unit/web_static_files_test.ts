import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { describe, test } from 'node:test';

import { WebStaticFiles } from '../../src/server/web_static_files.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	web_static_files_test — checks every folder the application mounts is where it is said to be
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('WebStaticFiles.publicFolderPath', () => {
	test('points at the public folder of this package', () => {
		const folderPath = WebStaticFiles.publicFolderPath();

		Assert.equal(Fs.existsSync(folderPath), true, `${folderPath} should exist`);
		Assert.equal(Path.basename(folderPath), 'public');
	});
});

describe('WebStaticFiles.chatFolderPath', () => {
	test('points at the folder holding the page, its stylesheet, and the TypeScript of its script', () => {
		const folderPath = WebStaticFiles.chatFolderPath();

		Assert.equal(Fs.existsSync(Path.join(folderPath, 'index.html')), true);
		Assert.equal(Fs.existsSync(Path.join(folderPath, 'css', 'chat_page.css')), true);
		Assert.equal(Fs.existsSync(Path.join(folderPath, 'src', 'chat_page.ts')), true);
	});

	test('sits under the public folder, so that one mount serves the whole of it', () => {
		Assert.equal(
			WebStaticFiles.chatFolderPath().startsWith(WebStaticFiles.publicFolderPath() + Path.sep),
			true,
		);
	});
});

describe('WebStaticFiles.bootstrapStylesheetPath', () => {
	test('points at the stylesheet inside the bootstrap package, on the disk of this machine', () => {
		const filePath = WebStaticFiles.bootstrapStylesheetPath();

		Assert.equal(Fs.existsSync(filePath), true, `${filePath} should exist`);
		Assert.equal(Path.basename(filePath), 'bootstrap.min.css');
		Assert.match(filePath, /node_modules[/\\]bootstrap[/\\]/);
	});
});

describe('WebStaticFiles.bootstrapStylesheetFolderPath', () => {
	test('points at the folder that stylesheet sits in, which is what is mounted', () => {
		const folderPath = WebStaticFiles.bootstrapStylesheetFolderPath();

		Assert.equal(Fs.existsSync(Path.join(folderPath, 'bootstrap.min.css')), true);
		Assert.equal(Path.basename(folderPath), 'css');
	});
});
