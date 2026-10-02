import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function MarkdownViewer({ content = '', className = '', onWikiLinkClick = null }) {
  const htmlContent = useMemo(() => {
    if (!content) return '';
    try {
      // 1. Pre-process [[WikiLinks]] before markdown parsing
      const withWikiLinks = content.replace(/\[\[(.*?)\]\]/g, (match, title) => {
        const safeTitle = escapeHtml(title.trim());
        return `<span class="wikilink-pill" data-wikititle="${safeTitle}">🔗 ${safeTitle}</span>`;
      });

      // 2. Custom renderer for marked to build code-wrap with copy button and highlight.js
      const renderer = new marked.Renderer();

      renderer.code = function({ text, lang }) {
        const language = lang || '';
        // Without a highlighter the source must be escaped, or HTML/JSX snippets
        // would be parsed as real markup instead of shown as code.
        let highlighted = escapeHtml(text);

        if (typeof window !== 'undefined' && window.hljs) {
          try {
            if (language && window.hljs.getLanguage(language)) {
              highlighted = window.hljs.highlight(text, { language, ignoreIllegals: true }).value;
            } else {
              highlighted = window.hljs.highlightAuto(text).value;
            }
          } catch {
            highlighted = escapeHtml(text);
          }
        }

        const safeLang = escapeHtml(language);
        const langBadge = language ? `<span class="code-lang">${safeLang}</span>` : '';
        return `
          <div class="code-wrap">
            ${langBadge}
            <button type="button" class="code-copy" data-code="${encodeURIComponent(text)}">Copiar</button>
            <pre><code class="hljs ${language ? `language-${safeLang}` : ''}">${highlighted}</code></pre>
          </div>
        `;
      };

      // Options are passed per call so the shared marked instance is not mutated.
      const rawHtml = marked.parse(withWikiLinks, {
        renderer,
        breaks: true,
        gfm: true
      });

      return DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ['data-wikititle', 'data-code'],
        ADD_TAGS: ['button']
      });
    } catch (err) {
      console.error('Error rendering markdown:', err);
      // This string goes into dangerouslySetInnerHTML: never return raw input.
      return `<pre>${escapeHtml(content)}</pre>`;
    }
  }, [content]);

  const handleClick = (e) => {
    // 1. Handle WikiLinks click
    const wikiTarget = e.target.closest('.wikilink-pill');
    if (wikiTarget && onWikiLinkClick) {
      const title = wikiTarget.getAttribute('data-wikititle');
      if (title) onWikiLinkClick(title);
      return;
    }

    // 2. Handle Copy Code click
    const copyButton = e.target.closest('.code-copy');
    if (copyButton) {
      const encodedCode = copyButton.getAttribute('data-code');
      const codeText = encodedCode ? decodeURIComponent(encodedCode) : copyButton.nextElementSibling?.textContent || '';
      if (codeText) {
        navigator.clipboard.writeText(codeText);
        copyButton.classList.add('copied');
        setTimeout(() => {
          copyButton.classList.remove('copied');
        }, 2000);
      }
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
