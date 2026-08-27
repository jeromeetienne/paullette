import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { PackageVersionReader, UNKNOWN_VERSION } from '../../src/config_runtime/package_version_reader.ts';
import { TemporaryFolder } from './libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	package_version_reader_test — checks PackageVersionReader reads the version of code-agent
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('PackageVersionReader.read', () => {
	test('reads the version the package.json of code-agent holds', () => {
		const filePath = Path.join(import.meta.dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(Fs.readFileSync(filePath, 'utf8'));

		Assert.notEqual(packageJson.version, undefined);
		Assert.equal(PackageVersionReader.read(), packageJson.version);
	});
});

describe('PackageVersionReader.findPackageJsonFilePath', () => {
	let temporaryFolderPath = '';

	beforeEach(() => {
		temporaryFolderPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(temporaryFolderPath);
	});

	test('finds a package.json sitting in the folder it starts from', () => {
		const filePath = TemporaryFolder.writeFile(temporaryFolderPath, 'package.json', '{}');

		Assert.equal(PackageVersionReader.findPackageJsonFilePath(temporaryFolderPath), filePath);
	});

	test('finds a package.json sitting in a folder further up', () => {
		const filePath = TemporaryFolder.writeFile(temporaryFolderPath, 'package.json', '{}');
		const deepFolderPath = Path.join(temporaryFolderPath, 'dist', 'config');
		Fs.mkdirSync(deepFolderPath, {
			recursive: true,
		});

		Assert.equal(PackageVersionReader.findPackageJsonFilePath(deepFolderPath), filePath);
	});
});

describe('PackageVersionReader.readVersionFrom', () => {
	let temporaryFolderPath = '';

	beforeEach(() => {
		temporaryFolderPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(temporaryFolderPath);
	});

	test('reads the version field', () => {
		const fileText = JSON.stringify({
			version: '9.8.7',
		});
		const filePath = TemporaryFolder.writeFile(temporaryFolderPath, 'package.json', fileText);

		Assert.equal(PackageVersionReader.readVersionFrom(filePath), '9.8.7');
	});

	test('gives the unknown version when the file is absent', () => {
		const filePath = Path.join(temporaryFolderPath, 'package.json');

		Assert.equal(PackageVersionReader.readVersionFrom(filePath), UNKNOWN_VERSION);
	});

	test('gives the unknown version when the file is not valid JSON', () => {
		const filePath = TemporaryFolder.writeFile(temporaryFolderPath, 'package.json', 'this is not JSON');

		Assert.equal(PackageVersionReader.readVersionFrom(filePath), UNKNOWN_VERSION);
	});

	test('gives the unknown version when there is no version field', () => {
		const fileText = JSON.stringify({
			name: 'code-agent',
		});
		const filePath = TemporaryFolder.writeFile(temporaryFolderPath, 'package.json', fileText);

		Assert.equal(PackageVersionReader.readVersionFrom(filePath), UNKNOWN_VERSION);
	});
});
