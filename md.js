// md.js — 轻量 Markdown 渲染（笔记预览用）
// 先转义 HTML，再做格式转换，输出是安全的 HTML 字串。
// 支援：标题、粗体/斜体/删除线、行内程式码、程式码区块、清单、待办清单、
//       引用、分隔线、表格、链接。

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function inline(value) {
  let text = esc(value);
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  return text;
}

const isListLine = (line) => /^\s*([-*+]|\d+\.)\s+\S/.test(line);
const isOrderedLine = (line) => /^\s*\d+\.\s+\S/.test(line);
const isHeadingLine = (line) => /^#{1,6}\s+\S/.test(line);
const isHrLine = (line) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
const isQuoteLine = (line) => /^\s*>\s?/.test(line);

function isBlockStart(line) {
  return (
    isHeadingLine(line) ||
    isHrLine(line) ||
    isQuoteLine(line) ||
    isListLine(line) ||
    /^```/.test(line) ||
    /^\s*\|/.test(line)
  );
}

function parseTableRow(line) {
  let text = String(line).trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text.split('|').map((cell) => cell.trim());
}

function tableAt(lines, index) {
  const headerLine = lines[index];
  if (!headerLine || !headerLine.includes('|')) return null;
  const separator = lines[index + 1];
  if (!separator || !separator.includes('|') || !/^[\s|:-]+$/.test(separator)) return null;
  const dashCells = parseTableRow(separator).filter((cell) => /^:?-{3,}:?$/.test(cell));
  const header = parseTableRow(headerLine);
  if (!header.length || dashCells.length !== header.length) return null;

  const aligns = parseTableRow(separator).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });

  const rows = [];
  let cursor = index + 2;
  while (cursor < lines.length && lines[cursor].includes('|') && !/^\s*$/.test(lines[cursor])) {
    rows.push(parseTableRow(lines[cursor]));
    cursor += 1;
  }
  return { header, aligns, rows, next: cursor };
}

function renderTable(table) {
  const head = table.header
    .map((cell, i) => `<th style="text-align:${table.aligns[i] || 'left'}">${inline(cell)}</th>`)
    .join('');
  const body = table.rows
    .map(
      (row) =>
        `<tr>${table.header
          .map((_, i) => `<td style="text-align:${table.aligns[i] || 'left'}">${inline(row[i] || '')}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `<div class="md-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/**
 * 把 Markdown 转成 HTML 字串（已转义，可安全塞进 innerHTML）。
 */
export function renderMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    // 程式码区块
    if (/^```/.test(line)) {
      const buffer = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buffer.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过结尾的 ```
      out.push(`<pre><code>${esc(buffer.join('\n'))}</code></pre>`);
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // 分隔线
    if (isHrLine(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    // 引用
    if (isQuoteLine(line)) {
      const buffer = [];
      while (i < lines.length && isQuoteLine(lines[i])) {
        buffer.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${buffer.map(inline).join('<br>')}</blockquote>`);
      continue;
    }

    // 表格
    const table = tableAt(lines, i);
    if (table) {
      out.push(renderTable(table));
      i = table.next;
      continue;
    }

    // 清单
    if (isListLine(line)) {
      const ordered = isOrderedLine(line);
      const items = [];
      while (i < lines.length && isListLine(lines[i])) {
        const content = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
        const checkbox = content.match(/^\[([ xX])\]\s*(.*)$/);
        if (checkbox) {
          const checked = checkbox[1].toLowerCase() === 'x';
          items.push(
            `<li class="md-check ${checked ? 'done' : ''}"><span class="md-box">${checked ? '☑' : '☐'}</span>${inline(checkbox[2])}</li>`
          );
        } else {
          items.push(`<li>${inline(content)}</li>`);
        }
        i += 1;
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    // 段落
    const paragraph = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
      if (tableAt(lines, i)) break;
      paragraph.push(lines[i]);
      i += 1;
    }
    if (paragraph.length) {
      out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    } else {
      // 防御：避免无穷回圈
      out.push(`<p>${inline(lines[i] || '')}</p>`);
      i += 1;
    }
  }

  return out.join('\n');
}
