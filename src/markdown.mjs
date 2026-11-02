const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * The little Markdown incident updates need: paragraphs, "- " lists, `code`, **bold**, *italic* and
 * [links](https://…). Anything else shows as typed, and raw HTML is escaped.
 */
export function renderMarkdown(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim());
      if (lines.every((line) => /^[-*]\s+/.test(line))) {
        return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .join('\n');
}

function inline(text) {
  const code = [];
  let html = escapeHtml(text.replace(/`([^`]+)`/g, (_, snippet) => `\u0000${code.push(snippet) - 1}\u0000`));
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) =>
    /^(https?:\/\/|mailto:|\/|#)/i.test(href) ? `<a href="${href}">${label}</a>` : match,
  );
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, '<em>$1</em>');
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${escapeHtml(code[index])}</code>`);
}
