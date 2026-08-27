import Assert from 'node:assert/strict';
import Path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { ModelContextProtocolConfigReader } from '../../src/model_context_protocol/model_context_protocol_config_reader.ts';
import { type ModelContextProtocolServerDefinition } from '../../src/model_context_protocol/model_context_protocol_types.ts';
import { TemporaryFolder } from '../libs/temporary_folder.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	model_context_protocol_config_reader_test — checks the three sources are read and merged
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('ModelContextProtocolConfigReader.readAll', () => {
	/** The folder each test works inside, standing in for the project root. */
	let projectRootPath = '';

	/** The folder standing in for the `.paullette` folder of the user. */
	let userConfigFolderPath = '';

	/**
	 * Where the `.paullette` folder of the project sits inside the temporary folder.
	 *
	 * @returns The absolute path.
	 */
	const configFolderPath = () => Path.join(projectRootPath, '.paullette');

	/**
	 * Reads every declared server out of the temporary folders.
	 *
	 * @returns What the reader found.
	 */
	const readAll = () =>
		ModelContextProtocolConfigReader.readAll({
			projectRootPath: projectRootPath,
			configFolderPath: configFolderPath(),
			userConfigFolderPath: userConfigFolderPath,
		});

	/**
	 * Finds one server in a result by its name.
	 *
	 * @param serverDefinitions Every server that was read.
	 * @param serverName The name to look for.
	 * @returns The server.
	 * @throws When there is no server of that name.
	 */
	const findByName = (
		serverDefinitions: ModelContextProtocolServerDefinition[],
		serverName: string,
	): ModelContextProtocolServerDefinition => {
		const found = serverDefinitions.find((serverDefinition) => serverDefinition.name === serverName);
		if (found === undefined) {
			throw new Error(`the server ${serverName} was not read`);
		}
		return found;
	};

	beforeEach(() => {
		projectRootPath = TemporaryFolder.make();
		userConfigFolderPath = TemporaryFolder.make();
	});

	afterEach(() => {
		TemporaryFolder.remove(projectRootPath);
		TemporaryFolder.remove(userConfigFolderPath);
	});

	test('reads nothing and warns about nothing when none of the three files exists', () => {
		const result = readAll();

		Assert.deepEqual(result.serverDefinitions, []);
		Assert.deepEqual(result.warnings, []);
	});

	test('reads a standard input and output server out of the .mcp.json file at the project root', () => {
		TemporaryFolder.writeFile(
			projectRootPath,
			'.mcp.json',
			JSON.stringify({
				mcpServers: {
					now: {
						command: 'npx',
						args: ['-y', 'mcp-now'],
						env: {
							TIME_ZONE: 'Europe/Paris',
						},
					},
				},
			}),
		);

		const result = readAll();

		Assert.deepEqual(result.warnings, []);
		Assert.equal(result.serverDefinitions.length, 1);
		const serverDefinition = findByName(result.serverDefinitions, 'now');
		Assert.equal(serverDefinition.name, 'now');
		Assert.equal(serverDefinition.filePath, Path.join(projectRootPath, '.mcp.json'));
		Assert.deepEqual(serverDefinition.entry, {
			command: 'npx',
			args: ['-y', 'mcp-now'],
			env: {
				TIME_ZONE: 'Europe/Paris',
			},
		});
	});

	test('reads an HTTP server, keeping its address and its headers', () => {
		TemporaryFolder.writeFile(
			projectRootPath,
			'.mcp.json',
			JSON.stringify({
				mcpServers: {
					remote: {
						type: 'http',
						url: 'https://example.invalid/model-context-protocol',
						headers: {
							Authorization: 'Bearer something',
						},
					},
				},
			}),
		);

		const result = readAll();

		Assert.deepEqual(result.warnings, []);
		Assert.deepEqual(findByName(result.serverDefinitions, 'remote').entry, {
			type: 'http',
			url: 'https://example.invalid/model-context-protocol',
			headers: {
				Authorization: 'Bearer something',
			},
		});
	});

	test('reads the mcpServers field of the settings file of the user and of the settings file of the project', () => {
		TemporaryFolder.writeFile(
			userConfigFolderPath,
			'settings.json',
			JSON.stringify({
				mcpServers: {
					fromTheUser: {
						command: 'user-program',
					},
				},
			}),
		);
		TemporaryFolder.writeFile(
			projectRootPath,
			Path.join('.paullette', 'settings.json'),
			JSON.stringify({
				mcpServers: {
					fromTheProject: {
						command: 'project-program',
					},
				},
			}),
		);

		const result = readAll();

		Assert.deepEqual(result.warnings, []);
		Assert.deepEqual(
			result.serverDefinitions.map((serverDefinition) => serverDefinition.name).sort(),
			['fromTheProject', 'fromTheUser'],
		);
	});

	test('lets the settings file of the project win over the .mcp.json file and over the settings file of the user', () => {
		const declareIn = (folderPath: string, relativePath: string, commandName: string) => {
			TemporaryFolder.writeFile(
				folderPath,
				relativePath,
				JSON.stringify({
					mcpServers: {
						shared: {
							command: commandName,
						},
					},
				}),
			);
		};

		declareIn(userConfigFolderPath, 'settings.json', 'from-the-user');
		declareIn(projectRootPath, '.mcp.json', 'from-the-servers-file');
		declareIn(projectRootPath, Path.join('.paullette', 'settings.json'), 'from-the-project');

		const result = readAll();

		Assert.equal(result.serverDefinitions.length, 1);
		Assert.deepEqual(findByName(result.serverDefinitions, 'shared').entry, {
			command: 'from-the-project',
		});
		Assert.equal(
			findByName(result.serverDefinitions, 'shared').filePath,
			Path.join(projectRootPath, '.paullette', 'settings.json'),
		);
	});

	test('lets the .mcp.json file win over the settings file of the user', () => {
		TemporaryFolder.writeFile(
			userConfigFolderPath,
			'settings.json',
			JSON.stringify({
				mcpServers: {
					shared: {
						command: 'from-the-user',
					},
				},
			}),
		);
		TemporaryFolder.writeFile(
			projectRootPath,
			'.mcp.json',
			JSON.stringify({
				mcpServers: {
					shared: {
						command: 'from-the-servers-file',
					},
				},
			}),
		);

		const result = readAll();

		Assert.equal(result.serverDefinitions.length, 1);
		Assert.deepEqual(findByName(result.serverDefinitions, 'shared').entry, {
			command: 'from-the-servers-file',
		});
	});

	test('skips an entry that names neither a command nor a url, and keeps the good entries', () => {
		TemporaryFolder.writeFile(
			projectRootPath,
			'.mcp.json',
			JSON.stringify({
				mcpServers: {
					broken: {
						description: 'this entry says nothing about how to reach anything',
					},
					good: {
						command: 'good-program',
					},
				},
			}),
		);

		const result = readAll();

		Assert.deepEqual(
			result.serverDefinitions.map((serverDefinition) => serverDefinition.name),
			['good'],
		);
		Assert.equal(result.warnings.length, 1);
		Assert.equal(result.warnings[0]?.serverName, 'broken');
		Assert.match(String(result.warnings[0]?.message), /neither a command to run nor a url to reach/);
	});

	test('warns about a file that is not valid JSON and still reads the other files', () => {
		TemporaryFolder.writeFile(projectRootPath, '.mcp.json', '{ this is not JSON');
		TemporaryFolder.writeFile(
			projectRootPath,
			Path.join('.paullette', 'settings.json'),
			JSON.stringify({
				mcpServers: {
					good: {
						command: 'good-program',
					},
				},
			}),
		);

		const result = readAll();

		Assert.deepEqual(
			result.serverDefinitions.map((serverDefinition) => serverDefinition.name),
			['good'],
		);
		Assert.equal(result.warnings.length, 1);
		Assert.equal(result.warnings[0]?.serverName, null);
		Assert.match(String(result.warnings[0]?.message), /is not valid JSON/);
	});

	test('reads a settings file that holds no mcpServers field without warning about it', () => {
		TemporaryFolder.writeFile(
			projectRootPath,
			Path.join('.paullette', 'settings.json'),
			JSON.stringify({
				somethingElse: true,
			}),
		);

		const result = readAll();

		Assert.deepEqual(result.serverDefinitions, []);
		Assert.deepEqual(result.warnings, []);
	});
});
