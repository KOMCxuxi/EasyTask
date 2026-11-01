// richtext.js — 富文本笔记的 HTML 清理与转换
// 笔记用 contenteditable（像 iOS 备忘录那样直接看到格式）。
// 存进 IndexedDB 前一律经过 sanitizeHtml()，避免备份汇入夹带奇怪的标签。

const ALLOWED = new Set([
  'P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL',
  'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
  'BLOCKQUOTE', 'HR', 'SPAN', 'A', 'CODE', 'PRE', 'MARK',
]);

const VOID = new Set(['BR', 'HR']);

const HIGHLIGHT_CLASSES = new Set(['hl-yellow', 'hl-pink', 'hl-green', 'hl-blue']);
const HIGHLIGHT_COLORS = [
  ['255, 224, 102', 'hl-yellow'],
  ['255, 179, 199', 'hl-pink'],
  ['183, 240, 192', 'hl-green'],
  ['185, 220, 255', 'hl-blue'],
];

function highlightFromStyle(style) {
  const value = String(style || '').toLowerCase();
  const match = /background(?:-color)?\s*:\s*([^;]+)/i.exec(value);
  if (!match) return '';
  const color = match[1].replace(/\s+/g, ' ');
  for (const [rgb, cls] of HIGHLIGHT_COLORS) {
    if (color.includes(rgb)) return cls;
  }
  return '';
}

function cleanChildren(node, doc) {
  const out = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.nodeValue) out.push(doc.createTextNode(child.nodeValue));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.tagName;
    if (!ALLOWED.has(tag)) {
      out.push(...cleanChildren(child, doc));
      continue;
    }

    if (tag === 'SPAN') {
      if (child.classList.contains('todo-box')) {
        const span = doc.createElement('span');
        span.className = 'todo-box';
        span.textContent = child.textContent;
        out.push(span);
        continue;
      }
      const hl = highlightFromStyle(child.getAttribute('style'));
      if (hl) {
        const mark = doc.createElement('mark');
        mark.className = hl;
        for (const cleaned of cleanChildren(child, doc)) mark.appendChild(cleaned);
        out.push(mark);
      } else {
        // 贴上的 span 一律拆掉，避免把来源网站的字级/颜色带进来
        out.push(...cleanChildren(child, doc));
      }
      continue;
    }

    const el = doc.createElement(tag);
    if (tag === 'A') {
      const href = child.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        el.setAttribute('href', href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (tag === 'MARK') {
      const cls = Array.from(child.classList).find((name) => HIGHLIGHT_CLASSES.has(name));
      el.className = cls || 'hl-yellow';
    }
    if (tag === 'UL' && child.classList.contains('rich-todo')) el.className = 'rich-todo';
    if (tag === 'LI' && child.classList.contains('done')) el.className = 'done';
    if (tag === 'LI' && child.classList.contains('md-check')) el.className = 'md-check done';

    if (!VOID.has(tag)) {
      const cleaned = cleanChildren(child, doc);
      const hl = tag === 'MARK' ? '' : highlightFromStyle(child.getAttribute('style'));
      if (hl) {
        const mark = doc.createElement('mark');
        mark.className = hl;
        for (const node of cleaned) mark.appendChild(node);
        el.appendChild(mark);
      } else {
        for (const node of cleaned) el.appendChild(node);
      }
    }
    out.push(el);
  }
  return out;
}

/** 清理 HTML，只保留白名单标签（用于存档与显示） */
export function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const holder = document.createElement('div');
  for (const node of cleanChildren(template.content, document)) holder.appendChild(node);
  return holder.innerHTML;
}

/** 贴上时先正规化：标题层级收敛、移除 font/span 的字级与颜色，再走白名单清理 */
export function sanitizePasteHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  template.content.querySelectorAll('h4, h5, h6').forEach((heading) => {
    const h3 = document.createElement('h3');
    while (heading.firstChild) h3.appendChild(heading.firstChild);
    heading.replaceWith(h3);
  });
  template.content.querySelectorAll('font').forEach((font) => {
    font.replaceWith(...Array.from(font.childNodes));
  });
  return sanitizeHtml(template.innerHTML);
}

/** 把富文本转成纯文字（存 body 供列表预览 / 搜索） */
export function htmlToText(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const holder = document.createElement('div');
  holder.appendChild(template.content.cloneNode(true));

  holder.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')));
  holder.querySelectorAll('p, div, li, tr, h1, h2, h3, blockquote').forEach((el) => {
    el.appendChild(document.createTextNode('\n'));
  });

  return holder.textContent
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 判断一段 HTML 是否只有空白（contenteditable 常见 <br>） */
export function isEmptyHtml(html) {
  return !htmlToText(html);
}

/* ---------------- 汇出用：HTML → Markdown ---------------- */

function escapeMdText(text) {
  return String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/([\\`*_[\]])/g, '\\$1');
}

function inlineMarkdown(node) {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += escapeMdText(child.nodeValue);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.tagName;
    const inner = inlineMarkdown(child);
    if (tag === 'B' || tag === 'STRONG') out += `**${inner}**`;
    else if (tag === 'I' || tag === 'EM') out += `*${inner}*`;
    else if (tag === 'U') out += inner;
    else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out += `~~${inner}~~`;
    else if (tag === 'CODE') out += `\`${inner}\``;
    else if (tag === 'A') {
      const href = child.getAttribute('href') || '';
      out += href ? `[${inner}](${href})` : inner;
    } else if (tag === 'BR') {
      out += '\n';
    } else {
      out += inner;
    }
  }
  return out;
}

function tableMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.children).map((cell) => inlineMarkdown(cell).replace(/\s+/g, ' ').trim())
  );
  if (!rows.length) return '';
  const cols = Math.max(...rows.map((row) => row.length));
  const pad = (row) => Array.from({ length: cols }, (_, index) => row[index] || '');
  const header = pad(rows[0]);
  const body = rows.slice(1).map(pad);
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function blockMarkdown(node, out) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.nodeValue.replace(/\s+/g, ' ').trim();
      if (text) out.push(escapeMdText(text));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.tagName;
    if (tag === 'P' || tag === 'DIV') {
      const text = inlineMarkdown(child).trim();
      if (text) out.push(text);
    } else if (/^H[1-6]$/.test(tag)) {
      const text = inlineMarkdown(child).trim();
      if (text) out.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
    } else if (tag === 'UL' || tag === 'OL') {
      const ordered = tag === 'OL';
      let index = 0;
      for (const item of Array.from(child.children)) {
        if (item.tagName !== 'LI') continue;
        index += 1;
        const box = item.querySelector('.todo-box');
        const text = inlineMarkdown(item).replace(/\s+/g, ' ').trim();
        if (box) {
          const checked = box.textContent.trim() === '☑';
          out.push(`- [${checked ? 'x' : ' '}] ${text.replace(/^[☐☑]\s*/, '')}`);
        } else {
          out.push(`${ordered ? `${index}.` : '-'} ${text}`);
        }
      }
    } else if (tag === 'TABLE') {
      const table = tableMarkdown(child);
      if (table) out.push(table);
    } else if (tag === 'BLOCKQUOTE') {
      const text = inlineMarkdown(child).replace(/\s+/g, ' ').trim();
      if (text) out.push(`> ${text}`);
    } else if (tag === 'HR') {
      out.push('---');
    } else if (tag === 'PRE') {
      out.push(`\`\`\`\n${child.textContent.replace(/\n$/, '')}\n\`\`\``);
    } else {
      const text = inlineMarkdown(child).trim();
      if (text) out.push(text);
    }
  }
}

/** 富文本 → Markdown（汇出 .md 用） */
export function htmlToMarkdown(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const holder = document.createElement('div');
  holder.appendChild(template.content.cloneNode(true));
  const blocks = [];
  blockMarkdown(holder, blocks);
  return blocks.join('\n\n');
}
