/**
 * Parser for the Netscape bookmark file format that every browser exports
 * (Chrome, Firefox, Edge, Safari).
 *
 * Folders are nested <DL> lists introduced by an <H3> heading. Each bookmark is
 * an <A HREF="..." ADD_DATE="..."> whose text and attributes are HTML-escaped,
 * so "&amp;" in a URL must become "&" before the URL is usable.
 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

/**
 * @param {string} text
 * @returns {string}
 */
export function decodeHtmlEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

function readAttribute(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return match ? decodeHtmlEntities(match[2] ?? match[3]) : '';
}

/**
 * @param {string} html exported bookmarks file
 * @returns {{title: string, url: string, folder: string, addedAt: string|null}[]}
 *   folder is the innermost folder name ('' at the root); addedAt is ISO or null.
 */
export function parseNetscapeBookmarks(html) {
  const tokenRegex = /<H3[^>]*>([\s\S]*?)<\/H3>|<DL[^>]*>|<\/DL>|<A\s([^>]*)>([\s\S]*?)<\/A>/gi;
  const folderStack = [];
  let pendingFolder = null;
  const bookmarks = [];
  let match;

  while ((match = tokenRegex.exec(html)) !== null) {
    const token = match[0];

    if (match[1] !== undefined) {
      pendingFolder = decodeHtmlEntities(stripTags(match[1])).trim();
    } else if (/^<DL/i.test(token)) {
      folderStack.push(pendingFolder);
      pendingFolder = null;
    } else if (/^<\/DL/i.test(token)) {
      folderStack.pop();
    } else {
      const attrs = match[2];
      const url = readAttribute(attrs, 'HREF').trim();
      const title = decodeHtmlEntities(stripTags(match[3])).trim();
      const addDate = Number(readAttribute(attrs, 'ADD_DATE'));
      const folder = [...folderStack].reverse().find(Boolean) || '';

      bookmarks.push({
        title,
        url,
        folder,
        // ADD_DATE is Unix seconds
        addedAt: addDate > 0 ? new Date(addDate * 1000).toISOString() : null
      });
    }
  }

  return bookmarks;
}
