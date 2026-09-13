import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export default function MarkdownViewer({ content = '', className = '', onWikiLinkClick = null }) {
  const htmlContent = useMemo(() => {
    if (!content) return '';
    try {
      // 1. Pre-process [[WikiLinks]] before markdown parsing
      const withWikiLinks = content.replace(/\[\[(.*?)\]\]/g, (match, title) => {
        return `<span class="wikilink-pill" data-wikititle="${title.trim()}">🔗 ${title.trim()}</span>`;
      });

      // 2. Custom renderer for marked to build code-wrap with copy button and highlight.js
      const renderer = new marked.Renderer();

      renderer.code = function({ text, lang }) {
        const language = lang || '';
        let highlighted = text;

        if (typeof window !== 'undefined' && window.hljs) {
          try {
            if (language && window.hljs.getLanguage(language)) {
              highlighted = window.hljs.highlight(text, { language, ignoreIllegals: true }).value;
            } else {
              highlighted = window.hljs.highlightAuto(text).value;
            }
          } catch {
            highlighted = text;
          }
        }

        const langBadge = language ? `<span class="code-lang">${language}</span>` : '';
        return `
          <div class="code-wrap">
            ${langBadge}
            <button type="button" class="code-copy" data-code="${encodeURIComponent(text)}">Copiar</button>
            <pre><code class="hljs ${language ? `language-${language}` : ''}">${highlighted}</code></pre>
          </div>
        `;
      };

      marked.setOptions({
        renderer,
        breaks: true,
        gfm: true
      });

      const rawHtml = marked.parse(withWikiLinks);

      return DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ['data-wikititle', 'data-code'],
        ADD_TAGS: ['button']
      });
    } catch (err) {
      console.error('Error rendering markdown:', err);
      return content;
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
