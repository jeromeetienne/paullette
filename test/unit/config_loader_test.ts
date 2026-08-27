import Assert from 'node:assert/strict';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { ConfigLoader } from '../../src/config_runtime/config_loader.ts';
import {
	DEFAULT_API_KEY,
	DEFAULT_BASE_URL,
	DEFAULT_MAXIMUM_TURN_COUNT,
	DEFAULT_MODEL_NAME,
} from '../../src/config_runtime/config_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	config_loader_test — checks ConfigLoader puts the command line, the environment, and the defaults in order
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Every environment variable `ConfigLoader` reads. Each one is cleared before a test and put back afterwards, so
 * that the environment of the person running the tests cannot change what a test sees.
 */
const READ_VARIABLE_NAMES = [
	'PAULLETTE_BASE_URL',
	'PAULLETTE_API_KEY',
	'PAULLETTE_MODEL',
	'OPENAI_BASE_URL',
	'OPENAI_API_KEY',
	'OPENAI_MODEL',
];

describe('ConfigLoader.load', () => {
	/** What each read variable held before the test, so that it can be put back. */
	let savedValues: Record<string, string | undefined> = {};

	beforeEach(() => {
		savedValues = {};
		for (const variableName of READ_VARIABLE_NAMES) {
			savedValues[variableName] = process.env[variableName];
			delete process.env[variableName];
		}
	});

	afterEach(() => {
		for (const variableName of READ_VARIABLE_NAMES) {
			const savedValue = savedValues[variableName];
			if (savedValue === undefined) {
				delete process.env[variableName];
				continue;
			}
			process.env[variableName] = savedValue;
		}
	});

	test('falls back to the defaults when nothing is given', () => {
		const config = ConfigLoader.load();

		Assert.equal(config.baseUrl, DEFAULT_BASE_URL);
		Assert.equal(config.apiKey, DEFAULT_API_KEY);
		Assert.equal(config.modelName, DEFAULT_MODEL_NAME);
		Assert.equal(config.maximumTurnCount, DEFAULT_MAXIMUM_TURN_COUNT);
		Assert.equal(config.workingDirectoryPath, Path.resolve(process.cwd()));
		Assert.equal(config.isPermissionPromptEnabled, true);
		Assert.equal(config.isToolCallLoggingEnabled, true);
	});

	test('reads the PAULLETTE variables when the command line gives nothing', () => {
		process.env.PAULLETTE_BASE_URL = 'http://127.0.0.1:9999/v1';
		process.env.PAULLETTE_API_KEY = 'from-the-environment';
		process.env.PAULLETTE_MODEL = 'model-from-the-environment';

		const config = ConfigLoader.load();

		Assert.equal(config.baseUrl, 'http://127.0.0.1:9999/v1');
		Assert.equal(config.apiKey, 'from-the-environment');
		Assert.equal(config.modelName, 'model-from-the-environment');
	});

	test('reads the OPENAI variables when the PAULLETTE variables are absent', () => {
		process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
		process.env.OPENAI_API_KEY = 'an-openai-key';
		process.env.OPENAI_MODEL = 'an-openai-model';

		const config = ConfigLoader.load();

		Assert.equal(config.baseUrl, 'https://api.openai.com/v1');
		Assert.equal(config.apiKey, 'an-openai-key');
		Assert.equal(config.modelName, 'an-openai-model');
	});

	test('prefers a PAULLETTE variable over the matching OPENAI variable', () => {
		process.env.PAULLETTE_MODEL = 'the-paullette-model';
		process.env.OPENAI_MODEL = 'the-openai-model';

		Assert.equal(ConfigLoader.load().modelName, 'the-paullette-model');
	});

	test('treats a variable set to an empty value as absent', () => {
		process.env.PAULLETTE_MODEL = '';
		process.env.OPENAI_MODEL = 'the-openai-model';

		Assert.equal(ConfigLoader.load().modelName, 'the-openai-model');
	});

	test('prefers the command line over both the environment and the defaults', () => {
		process.env.PAULLETTE_MODEL = 'the-environment-model';

		const config = ConfigLoader.load({
			modelName: 'the-command-line-model',
			maximumTurnCount: 3,
			isPermissionPromptEnabled: false,
			isToolCallLoggingEnabled: false,
		});

		Assert.equal(config.modelName, 'the-command-line-model');
		Assert.equal(config.maximumTurnCount, 3);
		Assert.equal(config.isPermissionPromptEnabled, false);
		Assert.equal(config.isToolCallLoggingEnabled, false);
	});

	test('makes the working folder absolute', () => {
		const config = ConfigLoader.load({
			workingDirectoryPath: '.',
		});

		Assert.equal(config.workingDirectoryPath, Path.resolve('.'));
		Assert.equal(Path.isAbsolute(config.workingDirectoryPath), true);
	});

	test('refuses a largest turn count that is not a positive whole number', () => {
		Assert.throws(() => {
			ConfigLoader.load({
				maximumTurnCount: 0,
			});
		});

		Assert.throws(() => {
			ConfigLoader.load({
				maximumTurnCount: 2.5,
			});
		});
	});
});
