import React, { useMemo } from 'react';
import { Marked } from 'marked';
import createDOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import 'highlight.js/styles/github-dark-dimmed.css';

// Only common languages are bundled; anything else is shown escaped, unhighlighted.
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerAliases(['html', 'jsx', 'svg'], { languageName: 'xml' });
hljs.registerAliases(['js'], { languageName: 'javascript' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
hljs.registerAliases(['sh', 'shell', 'zsh'], { languageName: 'bash' });

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(code, language) {
  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    }
  } catch {
    // fall through to plain escaped text
  }
  return escapeHtml(code);
}

// [[Title]] as an inline Markdown token: unlike a regex over the raw text,
// the lexer never looks inside code spans or code blocks.
const wikiLinkExtension = {
  name: 'wikiLink',
  level: 'inline',
  start(src) {
    const index = src.indexOf('[[');
    return index === -1 ? undefined : index;
  },
  tokenizer(src) {
    const match = /^\[\[([^[\]\n]+?)\]\]/.exec(src);
    if (match) {
      return { type: 'wikiLink', raw: match[0], title: match[1].trim() };
    }
    return undefined;
  },
  renderer(token) {
    const title = escapeHtml(token.title);
    return `<button type="button" class="wikilink-pill" data-wikititle="${title}">🔗 ${title}</button>`;
  }
};

// One configured instance for the whole app (never mutate the global `marked`).
const markdownParser = new Marked(
  { gfm: true, breaks: true },
  {
    extensions: [wikiLinkExtension],
    renderer: {
      code({ text, lang }) {
        const language = (lang || '').trim().split(/\s+/)[0];
        const safeLang = escapeHtml(language);
        const langBadge = language ? `<span class="code-lang">${safeLang}</span>` : '';
        return `
          <div class="code-wrap">
            ${langBadge}
            <button type="button" class="code-copy" data-code="${encodeURIComponent(text)}">Copiar</button>
            <pre><code class="hljs ${language ? `language-${safeLang}` : ''}">${highlight(text, language)}</code></pre>
          </div>
        `;
      }
    }
  }
);

// Dedicated sanitizer instance so its hook does not leak into other DOMPurify users.
const purifier = createDOMPurify(window);
purifier.addHook('afterSanitizeAttributes', (node) => {
  // Links inside a note open in a new tab instead of navigating the app away.
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

function renderMarkdown(content) {
  try {
    return purifier.sanitize(markdownParser.parse(content), {
      ADD_ATTR: ['data-wikititle', 'data-code', 'target'],
      ADD_TAGS: ['button']
    });
  } catch (err) {
    console.error('Error rendering markdown:', err);
    // This string goes into dangerouslySetInnerHTML: never return raw input.
    return `<pre>${escapeHtml(content)}</pre>`;
  }
}

export default function MarkdownViewer({ content = '', className = '', onWikiLinkClick = null }) {
  const htmlContent = useMemo(() => (content ? renderMarkdown(content) : ''), [content]);

  const handleClick = (e) => {
    const wikiTarget = e.target.closest('.wikilink-pill');
    if (wikiTarget) {
      // Handled here: do not let the click also trigger a parent (e.g. a card).
      e.stopPropagation();
      const title = wikiTarget.getAttribute('data-wikititle');
      if (title && onWikiLinkClick) onWikiLinkClick(title);
      return;
    }

    const copyButton = e.target.closest('.code-copy');
    if (copyButton) {
      e.stopPropagation();
      const encodedCode = copyButton.getAttribute('data-code');
      const codeText = encodedCode ? decodeURIComponent(encodedCode) : copyButton.nextElementSibling?.textContent || '';
      if (codeText) {
        navigator.clipboard?.writeText(codeText).then(() => {
          copyButton.classList.add('copied');
          setTimeout(() => copyButton.classList.remove('copied'), 2000);
        }).catch(() => {});
      }
      return;
    }

    if (e.target.closest('a')) e.stopPropagation();
  };

  return (
    // Clicks are delegated from the rendered HTML; its controls are real buttons/links.
    <div
      onClick={handleClick}
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
