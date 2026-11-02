import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from '../src/markdown.mjs';

test('paragraphs, line breaks and lists', () => {
  assert.equal(renderMarkdown('One\ntwo\n\nThree'), '<p>One<br>two</p>\n<p>Three</p>');
  assert.equal(renderMarkdown('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
});

test('inline formatting', () => {
  assert.equal(renderMarkdown('**bold**, *italic* and `x < y`'), '<p><strong>bold</strong>, <em>italic</em> and <code>x &lt; y</code></p>');
  assert.equal(renderMarkdown('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
});

test('HTML is escaped and only safe links become links', () => {
  assert.equal(renderMarkdown('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(
    renderMarkdown('[status](https://example.com/?a=1&b=2)'),
    '<p><a href="https://example.com/?a=1&amp;b=2">status</a></p>',
  );
  assert.equal(renderMarkdown('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
});

test('comments are dropped', () => {
  assert.equal(renderMarkdown('<!-- note -->\nShown'), '<p>Shown</p>');
});
