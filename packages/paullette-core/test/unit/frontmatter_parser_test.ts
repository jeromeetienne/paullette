import Assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { FrontmatterParser } from '../../src/config_folder/frontmatter_parser.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	frontmatter_parser_test — checks FrontmatterParser splits a Markdown file correctly
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('FrontmatterParser.parse', () => {
	test('reads the frontmatter and the body of a file that has both', () => {
		const parsed = FrontmatterParser.parse('---\nname: review\ndescription: Reviews code\n---\n\nDo the review.\n');

		Assert.deepEqual(parsed.frontmatter, {
			name: 'review',
			description: 'Reviews code',
		});
		Assert.equal(parsed.body, 'Do the review.');
	});

	test('gives an empty frontmatter and the whole text when there is no frontmatter', () => {
		const parsed = FrontmatterParser.parse('  Just instructions.  ');

		Assert.deepEqual(parsed.frontmatter, {});
		Assert.equal(parsed.body, 'Just instructions.');
	});

	test('gives an empty frontmatter and keeps the body when the frontmatter is not valid YAML', () => {
		const parsed = FrontmatterParser.parse('---\nname: [unclosed\n---\n\nStill useful.\n');

		Assert.deepEqual(parsed.frontmatter, {});
		Assert.equal(parsed.body, 'Still useful.');
	});

	test('gives an empty frontmatter when the frontmatter is a list rather than a mapping', () => {
		const parsed = FrontmatterParser.parse('---\n- one\n- two\n---\n\nBody.\n');

		Assert.deepEqual(parsed.frontmatter, {});
		Assert.equal(parsed.body, 'Body.');
	});

	test('reads a file whose lines end with a carriage return and a line feed', () => {
		const parsed = FrontmatterParser.parse('---\r\nname: windows\r\n---\r\n\r\nBody.\r\n');

		Assert.deepEqual(parsed.frontmatter, {
			name: 'windows',
		});
		Assert.equal(parsed.body, 'Body.');
	});

	test('reads a file that starts with a byte order mark', () => {
		const parsed = FrontmatterParser.parse('﻿---\nname: marked\n---\n\nBody.\n');

		Assert.deepEqual(parsed.frontmatter, {
			name: 'marked',
		});
		Assert.equal(parsed.body, 'Body.');
	});

	test('does not treat three dashes further down the file as frontmatter', () => {
		const parsed = FrontmatterParser.parse('Some text.\n\n---\nname: late\n---\n');

		Assert.deepEqual(parsed.frontmatter, {});
		Assert.equal(parsed.body, 'Some text.\n\n---\nname: late\n---');
	});

	test('gives an empty body for a file that holds only frontmatter', () => {
		const parsed = FrontmatterParser.parse('---\nname: empty\n---\n');

		Assert.deepEqual(parsed.frontmatter, {
			name: 'empty',
		});
		Assert.equal(parsed.body, '');
	});
});
