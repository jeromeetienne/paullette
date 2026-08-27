import Yaml from 'yaml';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	FrontmatterParser — splits a Markdown file into its YAML frontmatter and its body
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The result of splitting a Markdown file into its YAML frontmatter and its body.
 */
export type ParsedFrontmatter = {
	/** The parsed YAML frontmatter, or an empty object when the file has no frontmatter. */
	frontmatter: Record<string, unknown>;
	/** The text of the file below the frontmatter, with the leading blank lines removed. */
	body: string;
};

/**
 * The expression that matches a YAML frontmatter block at the very start of a file. The block opens with a line
 * that holds only three dashes and closes with the same line.
 */
const FRONTMATTER_EXPRESSION = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Splits a Markdown file into its YAML frontmatter and its body.
 */
export class FrontmatterParser {
	/**
	 * Splits the text of a Markdown file into its YAML frontmatter and its body.
	 *
	 * A file with no frontmatter, or with frontmatter that is not valid YAML, produces an empty frontmatter and
	 * the whole text as the body. code-agent never rejects a file over its frontmatter, because a file that only
	 * holds instructions is still useful.
	 *
	 * @param fileText The whole text of the Markdown file.
	 * @returns The parsed frontmatter and the body.
	 */
	static parse(fileText: string): ParsedFrontmatter {
		const textWithoutByteOrderMark = fileText.replace(/^﻿/, '');
		const match = FRONTMATTER_EXPRESSION.exec(textWithoutByteOrderMark);

		if (match === null) {
			return {
				frontmatter: {},
				body: textWithoutByteOrderMark.trim(),
			};
		}

		const frontmatterText = match[1] ?? '';
		const body = textWithoutByteOrderMark.slice(match[0].length).trim();

		let frontmatter: Record<string, unknown> = {};
		try {
			const parsedValue = Yaml.parse(frontmatterText) as unknown;
			if (parsedValue !== null && typeof parsedValue === 'object' && Array.isArray(parsedValue) === false) {
				frontmatter = parsedValue as Record<string, unknown>;
			}
		} catch {
			frontmatter = {};
		}

		return {
			frontmatter: frontmatter,
			body: body,
		};
	}
}
