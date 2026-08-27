import { Marked } from 'marked';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebMarkdown — turns what the model wrote into HTML that holds no element of its own
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The schemes a link in an answer may use. Everything else, `javascript:` above all, becomes plain text.
 */
const ALLOWED_LINK_SCHEMES = ['http:', 'https:', 'mailto:'];

/**
 * The one Markdown reader, built once.
 *
 * `gfm` is on because a model writes tables and fenced code blocks. `breaks` is on because a model writes single
 * line breaks and means them.
 *
 * Three renderers are replaced, and all three replacements are there to stop the answer of the model from
 * becoming something the browser acts on rather than something a person reads:
 *
 * - `html` writes the HTML the model wrote as visible text instead of passing it through as an element.
 * - `link` drops the address when its scheme is not one a person expects a link to have.
 * - `image` never writes an `img` element, because a page that fetches an address the model chose would tell
 *   whoever owns that address what the model wrote.
 */
const marked = new Marked({
	gfm: true,
	breaks: true,
	renderer: {
		html({ text }): string {
			return WebMarkdown.escape(text);
		},
		link({ href, title, tokens }): string {
			const text = this.parser.parseInline(tokens);

			if (WebMarkdown.isAddressAllowed(href) === false) {
				return text;
			}

			const titlePart =
				title === null || title === undefined ? '' : ` title="${WebMarkdown.escape(title)}"`;
			const addressPart = WebMarkdown.escape(href).replaceAll('"', '&quot;');
			return `<a href="${addressPart}"${titlePart} target="_blank" rel="noreferrer noopener">${text}</a>`;
		},
		image({ href, text }): string {
			const shownText = WebMarkdown.escape(text.length > 0 ? text : href);

			if (WebMarkdown.isAddressAllowed(href) === false) {
				return shownText;
			}

			const addressPart = WebMarkdown.escape(href).replaceAll('"', '&quot;');
			return `<a href="${addressPart}" target="_blank" rel="noreferrer noopener">${shownText}</a>`;
		},
	},
});

/**
 * Turns what the model wrote into HTML for the page.
 */
export class WebMarkdown {
	/**
	 * Turns Markdown into HTML that holds no element the model wrote.
	 *
	 * @param markdownText What the model wrote.
	 * @returns The HTML to put in the page.
	 */
	static toHtml(markdownText: string): string {
		return marked.parse(markdownText, {
			async: false,
		});
	}

	/**
	 * Replaces the characters that could otherwise start an element or an entity.
	 *
	 * The check on `&` passes over a sequence that is already an entity, so that text which has been through
	 * this once is not changed again into something a reader would see as `&amp;lt;`.
	 *
	 * @param text The text to make safe.
	 * @returns The same text, with `&`, `<`, and `>` replaced by their entities.
	 */
	static escape(text: string): string {
		return text
			.replace(/&(?!#?[A-Za-z0-9]+;)/g, '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;');
	}

	/**
	 * Says whether a link in an answer may keep its address.
	 *
	 * An address with no scheme at all is allowed, because that is a link inside the page or inside the project.
	 * An address whose scheme cannot be read is refused, which is the safe direction.
	 *
	 * @param address The address the model wrote.
	 * @returns True when the address may be used, false when the link must become plain text.
	 */
	static isAddressAllowed(address: string): boolean {
		const trimmedAddress = address.trim();

		if (trimmedAddress.length === 0) {
			return false;
		}

		if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmedAddress) === false) {
			return true;
		}

		try {
			return ALLOWED_LINK_SCHEMES.includes(new URL(trimmedAddress).protocol) === true;
		} catch {
			return false;
		}
	}
}
