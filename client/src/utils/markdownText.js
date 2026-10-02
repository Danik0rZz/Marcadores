/**
 * Plain-text excerpt of a Markdown note for cards and tables. Cards only show
 * a few clamped lines, so parsing and sanitizing the full Markdown of every
 * note on each render is wasted work.
 *
 * @param {string} markdown
 * @param {number} maxLength
 * @returns {string}
 */
export function markdownExcerpt(markdown, maxLength = 240) {
  const text = String(markdown || '')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, ' $1 ') // fenced code: keep the code text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // wikilinks
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // headings, quotes, list markers
    .replace(/\[[ xX]\]\s*/g, '') // task checkboxes
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([^*_~]+?)\1/g, '$2') // emphasis
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}
