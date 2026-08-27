import Assert from 'node:assert/strict';
import Fs from 'node:fs';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
	CONFIG_FOLDER_NAME,
	CONFIG_SUBFOLDER_NAMES,
	ConfigFolderLocator,
} from '../../src/config_folder/config_folder_locator.ts';
import { TemporaryFolder } from '../libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	config_folder_locator_test — checks ConfigFolderLocator finds the project root and makes the folders
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('ConfigFolderLocator.locate', () => {
	/** The folder each test works inside. */
	let temporaryFolderPath = '';

	beforeEach(() => {
		temporaryFolderPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(temporaryFolderPath);
	});

	test('puts the folder in the working folder when there is no git folder above it', () => {
		const paths = ConfigFolderLocator.locate(temporaryFolderPath);

		Assert.equal(paths.projectRootPath, temporaryFolderPath);
		Assert.equal(paths.configFolderPath, Path.join(temporaryFolderPath, CONFIG_FOLDER_NAME));
	});

	test('finds the nearest folder above that holds a git folder', () => {
		Fs.mkdirSync(Path.join(temporaryFolderPath, '.git'));
		const deepFolderPath = Path.join(temporaryFolderPath, 'src', 'tools');
		Fs.mkdirSync(deepFolderPath, {
			recursive: true,
		});

		const paths = ConfigFolderLocator.locate(deepFolderPath);

		Assert.equal(paths.projectRootPath, temporaryFolderPath);
		Assert.equal(paths.configFolderPath, Path.join(temporaryFolderPath, CONFIG_FOLDER_NAME));
	});

	test('stops at the nearest git folder rather than the highest one', () => {
		Fs.mkdirSync(Path.join(temporaryFolderPath, '.git'));
		const innerProjectPath = Path.join(temporaryFolderPath, 'packages', 'inner');
		Fs.mkdirSync(Path.join(innerProjectPath, '.git'), {
			recursive: true,
		});

		Assert.equal(ConfigFolderLocator.locate(innerProjectPath).projectRootPath, innerProjectPath);
	});

	test('gives the same answer from any folder of a project', () => {
		Fs.mkdirSync(Path.join(temporaryFolderPath, '.git'));
		const firstFolderPath = Path.join(temporaryFolderPath, 'src');
		const secondFolderPath = Path.join(temporaryFolderPath, 'test', 'unit');
		Fs.mkdirSync(firstFolderPath, {
			recursive: true,
		});
		Fs.mkdirSync(secondFolderPath, {
			recursive: true,
		});

		Assert.equal(
			ConfigFolderLocator.locate(firstFolderPath).configFolderPath,
			ConfigFolderLocator.locate(secondFolderPath).configFolderPath,
		);
	});
});

describe('ConfigFolderLocator.ensureFolders', () => {
	/** The folder each test works inside. */
	let temporaryFolderPath = '';

	beforeEach(() => {
		temporaryFolderPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(temporaryFolderPath);
	});

	test('makes the folder and every subfolder of it', () => {
		const paths = ConfigFolderLocator.locate(temporaryFolderPath);

		ConfigFolderLocator.ensureFolders(paths);

		Assert.equal(Fs.existsSync(paths.configFolderPath), true);
		for (const subfolderName of CONFIG_SUBFOLDER_NAMES) {
			Assert.equal(
				Fs.existsSync(Path.join(paths.configFolderPath, subfolderName)),
				true,
				`${subfolderName} was not made`,
			);
		}
	});

	test('leaves a file that is already there exactly as it was', () => {
		const paths = ConfigFolderLocator.locate(temporaryFolderPath);
		ConfigFolderLocator.ensureFolders(paths);
		const filePath = Path.join(paths.configFolderPath, 'agents', 'reviewer.md');
		Fs.writeFileSync(filePath, 'the original text', 'utf8');

		ConfigFolderLocator.ensureFolders(paths);

		Assert.equal(Fs.readFileSync(filePath, 'utf8'), 'the original text');
	});
});
