import { db, initDb } from './db.js';
import { getRelatedNotesForBookmark, getRelatedBookmarksForNote, getAllCrossRelations } from './matchingService.js';

console.log('Testing DB and matching service...');
initDb();

const bookmarks = db.prepare('SELECT * FROM bookmarks').all();
console.log(`Found ${bookmarks.length} bookmarks`);

const notes = db.prepare('SELECT * FROM notes').all();
console.log(`Found ${notes.length} notes`);

for (const b of bookmarks) {
  const rel = getRelatedNotesForBookmark(b.id);
  console.log(`Bookmark "${b.title}" has ${rel.length} related notes:`);
  for (const r of rel) {
    console.log(`  - Note: "${r.note.title}" (Score: ${r.relationship.score}) -> Reasons: ${r.relationship.matchReasons.join(' | ')}`);
  }
}

for (const n of notes) {
  const rel = getRelatedBookmarksForNote(n.id);
  console.log(`Note "${n.title}" has ${rel.length} related bookmarks:`);
  for (const r of rel) {
    console.log(`  - Bookmark: "${r.bookmark.title}" (Score: ${r.relationship.score}) -> Reasons: ${r.relationship.matchReasons.join(' | ')}`);
  }
}

const matrix = getAllCrossRelations();
console.log(`Total cross-relations in matrix: ${matrix.length}`);
console.log('Test passed successfully!');
