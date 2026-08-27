import Assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { WebMarkdown } from '../../src/server/web_markdown.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	web_markdown_test — checks nothing the model writes can become an element in the page
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('WebMarkdown.toHtml', () => {
	test('turns ordinary Markdown into ordinary HTML', () => {
		const html = WebMarkdown.toHtml('# A heading\n\nSome **bold** text and `code`.');

		Assert.match(html, /<h1>A heading<\/h1>/);
		Assert.match(html, /<strong>bold<\/strong>/);
		Assert.match(html, /<code>code<\/code>/);
	});

	test('writes an element the model wrote as visible text and never as an element', () => {
		const html = WebMarkdown.toHtml('<img src=x onerror="alert(1)">');

		Assert.equal(html.includes('<img'), false);
		Assert.match(html, /&lt;img src=x onerror=/);
	});

	test('writes a script the model wrote as visible text', () => {
		const html = WebMarkdown.toHtml('<script>alert(1)</script>');

		Assert.equal(html.includes('<script'), false);
		Assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	});

	test('leaves a comparison inside a fenced code block readable', () => {
		const html = WebMarkdown.toHtml('```js\nconst x = 1 < 2 && 3 > 2;\n```');

		Assert.match(html, /const x = 1 &lt; 2 &amp;&amp; 3 &gt; 2;/);
		Assert.equal(
			html.includes('&amp;lt;'),
			false,
			'the escaping must not run twice, or a reader sees &lt; on the screen',
		);
	});

	test('keeps the address of a link that uses a scheme a person expects', () => {
		const html = WebMarkdown.toHtml('A [link](https://example.com) here.');

		Assert.match(html, /<a href="https:\/\/example\.com"[^>]*>link<\/a>/);
	});

	test('drops the address of a link that asks the browser to run something', () => {
		const html = WebMarkdown.toHtml('[click me](javascript:alert(1))');

		Assert.equal(html.includes('href'), false);
		Assert.match(html, /click me/);
	});

	test('never writes an image element, so the page fetches no address the model chose', () => {
		const html = WebMarkdown.toHtml('![the text](https://example.com/pixel.png)');

		Assert.equal(html.includes('<img'), false);
		Assert.match(html, /the text/);
	});

	test('turns a table into a table', () => {
		const html = WebMarkdown.toHtml('| a | b |\n| --- | --- |\n| 1 | 2 |');

		Assert.match(html, /<table>/);
		Assert.match(html, /<th>a<\/th>/);
	});
});

describe('WebMarkdown.escape', () => {
	test('replaces the three characters that could start an element', () => {
		Assert.equal(WebMarkdown.escape('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
	});

	test('leaves a sequence that is already an entity alone, so nothing is escaped twice', () => {
		Assert.equal(WebMarkdown.escape('&amp; and &#39;'), '&amp; and &#39;');
	});

	test('leaves text with none of the three characters unchanged', () => {
		Assert.equal(WebMarkdown.escape('plain text'), 'plain text');
	});
});

describe('WebMarkdown.isAddressAllowed', () => {
	test('allows the three schemes a link may use', () => {
		Assert.equal(WebMarkdown.isAddressAllowed('http://example.com'), true);
		Assert.equal(WebMarkdown.isAddressAllowed('https://example.com'), true);
		Assert.equal(WebMarkdown.isAddressAllowed('mailto:somebody@example.com'), true);
	});

	test('allows an address with no scheme, which is a link inside the project', () => {
		Assert.equal(WebMarkdown.isAddressAllowed('./src/file.ts'), true);
		Assert.equal(WebMarkdown.isAddressAllowed('#a-heading'), true);
	});

	test('refuses a scheme that asks the browser to run something', () => {
		Assert.equal(WebMarkdown.isAddressAllowed('javascript:alert(1)'), false);
		Assert.equal(WebMarkdown.isAddressAllowed('data:text/html,<script>alert(1)</script>'), false);
		Assert.equal(WebMarkdown.isAddressAllowed('file:///etc/passwd'), false);
	});

	test('refuses an empty address', () => {
		Assert.equal(WebMarkdown.isAddressAllowed('   '), false);
	});
});
