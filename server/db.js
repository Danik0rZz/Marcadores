import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
export const db = new Database(dbPath);

// Enable WAL mode, foreign keys and performance optimizations
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -32000'); // 32MB cache in RAM
db.pragma('temp_store = MEMORY');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT NOT NULL,
      subcategory TEXT DEFAULT '',
      theme TEXT DEFAULT '',
      favicon TEXT DEFAULT '',
      color TEXT DEFAULT '#10b981',
      icon TEXT DEFAULT 'bookmark',
      deleted_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT DEFAULT '',
      theme TEXT DEFAULT '',
      deleted_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS item_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type TEXT NOT NULL CHECK(item_type IN ('bookmark', 'note')),
      item_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(item_type, item_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS manual_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(bookmark_id, note_id)
    );

    CREATE INDEX IF NOT EXISTS idx_item_tags_item ON item_tags(item_type, item_id);
    CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_manual_bm ON manual_relations(bookmark_id);
    CREATE INDEX IF NOT EXISTS idx_manual_nt ON manual_relations(note_id);
  `);

  runMigrations();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bookmarks_taxonomy_theme ON bookmarks(category, subcategory, theme);
    CREATE INDEX IF NOT EXISTS idx_notes_taxonomy_theme ON notes(category, subcategory, theme);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_del ON bookmarks(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_notes_del ON notes(deleted_at);
  `);

  // Check if we should seed sample data
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM bookmarks').get();
  if (countStmt.count === 0) {
    seedSampleData();
  }
}

function seedSampleData() {
  console.log('Seeding initial sample data...');
  const now = new Date().toISOString();

  const insertBookmark = db.prepare(`
    INSERT INTO bookmarks (title, url, description, category, subcategory, theme, favicon, created_at, updated_at)
    VALUES (@title, @url, @description, @category, @subcategory, @theme, @favicon, @created_at, @updated_at)
  `);

  const insertNote = db.prepare(`
    INSERT INTO notes (title, content, category, subcategory, theme, created_at, updated_at)
    VALUES (@title, @content, @category, @subcategory, @theme, @created_at, @updated_at)
  `);

  const insertTag = db.prepare(`
    INSERT OR IGNORE INTO tags (name) VALUES (?)
  `);

  const getTag = db.prepare(`SELECT id FROM tags WHERE name = ?`);

  const linkTag = db.prepare(`
    INSERT OR IGNORE INTO item_tags (item_type, item_id, tag_id) VALUES (?, ?, ?)
  `);

  const linkManual = db.prepare(`
    INSERT OR IGNORE INTO manual_relations (bookmark_id, note_id, notes, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    // 1. Sample bookmarks
    const b1 = insertBookmark.run({
      title: 'Documentación Oficial de React 19',
      url: 'https://react.dev',
      description: 'Guía completa sobre Server Components, Hooks y nuevas APIs de React 19.',
      category: 'Desarrollo',
      subcategory: 'Frontend',
      theme: 'Estudio y Referencia Técnica',
      favicon: 'https://react.dev/favicon.ico',
      created_at: now,
      updated_at: now
    });

    const b2 = insertBookmark.run({
      title: 'SQLite Documentation - Window Functions',
      url: 'https://www.sqlite.org/windowfunctions.html',
      description: 'Referencia sintáctica y ejemplos de OVER, PARTITION BY y ORDER BY en SQLite.',
      category: 'Desarrollo',
      subcategory: 'Bases de Datos',
      theme: 'Optimización de Consultas',
      favicon: 'https://www.sqlite.org/favicon.ico',
      created_at: now,
      updated_at: now
    });

    const b3 = insertBookmark.run({
      title: 'Tailwind CSS Docs v4',
      url: 'https://tailwindcss.com/docs',
      description: 'Nuevas directivas @theme y motor Oxide de alto rendimiento.',
      category: 'Desarrollo',
      subcategory: 'Frontend',
      theme: 'Diseño de Interfaces',
      favicon: 'https://tailwindcss.com/favicons/favicon.ico',
      created_at: now,
      updated_at: now
    });

    const b4 = insertBookmark.run({
      title: 'Guía de Inversiones en ETFs Indexados',
      url: 'https://www.bogleheads.org',
      description: 'Filosofía Bogleheads para portafolios a largo plazo pasivos.',
      category: 'Finanzas',
      subcategory: 'Inversiones',
      theme: 'Planificación de Ahorro',
      favicon: 'https://www.bogleheads.org/favicon.ico',
      created_at: now,
      updated_at: now
    });

    // 2. Sample notes
    const n1 = insertNote.run({
      title: 'Apuntes sobre React 19 y Estado en el Cliente',
      content: `## Novedades Principales de React 19

> Los Server Components permiten renderizar componentes en el servidor reduciendo drásticamente el peso del bundle en el cliente.

### Hooks Esenciales:
- \`useActionState\`: Maneja acciones asíncronas de formularios con estado pendiente automático.
- \`useOptimistic\`: Permite actualizar la UI de inmediato antes de que el servidor confirme la mutación.
- \`use()\`: Permite leer promesas y contextos condicionalmente dentro de componentes.

### Tareas de Migración:
- [x] Actualizar dependencias a React 19 y ReactDOM 19
- [x] Reemplazar viejos reducers manuales por \`useActionState\`
- [ ] Optimizar transiciones concurrentes`,
      category: 'Desarrollo',
      subcategory: 'Frontend',
      theme: 'Estudio y Referencia Técnica',
      created_at: now,
      updated_at: now
    });

    const n2 = insertNote.run({
      title: 'Estrategias de Indexación en SQLite para Búsquedas Rápidas',
      content: `## Optimización y Tuning de SQLite

Para acelerar consultas multidimensionales combinadas por categoría y tags:

\`\`\`sql
-- Índice compuesto de alta selectividad
CREATE INDEX idx_bookmarks_cat ON bookmarks(category, subcategory, theme);
\`\`\`

### Pragmas Recomendados:
1. **WAL Mode**: \`PRAGMA journal_mode = WAL;\` (lecturas concurrentes sin bloquear escrituras).
2. **Synchronous**: \`PRAGMA synchronous = NORMAL;\` (equilibrio ideal entre durabilidad y rendimiento).
3. **Foreign Keys**: \`PRAGMA foreign_keys = ON;\` para integridad referencial.`,
      category: 'Desarrollo',
      subcategory: 'Bases de Datos',
      theme: 'Optimización de Consultas',
      created_at: now,
      updated_at: now
    });

    const n3 = insertNote.run({
      title: 'Distribución de Cartera Boglehead (80/20)',
      content: `## Filosofía de Inversión Indexada Pasiva

> "No busques la aguja en el pajar; compra el pajar entero." — John C. Bogle

### Asignación de Activos Recomendada:
- **80% Renta Variable Global:**
  - 60% S&P 500 / Total US Stock (ej. VOO / VTI)
  - 20% Mercados Desarrollados y Emergentes (ej. VXUS)
- **20% Renta Fija / Bonos:**
  - Bonos del Tesoro de corto y mediano plazo (ej. BND)

### Reglas de Disciplina:
- [x] Aportes mensuales automáticos sistemáticos
- [x] Reinversión de dividendos acumulativos
- [ ] Rebalanceo anual en caso de desvío > 5%`,
      category: 'Finanzas',
      subcategory: 'Inversiones',
      theme: 'Planificación de Ahorro',
      created_at: now,
      updated_at: now
    });

    // Tags
    const tagsList = ['react', 'javascript', 'frontend', 'sqlite', 'sql', 'database', 'performance', 'css', 'design', 'finanzas', 'etf', 'ahorro'];
    for (const tag of tagsList) {
      insertTag.run(tag);
    }

    const tagMap = {};
    for (const row of db.prepare('SELECT id, name FROM tags').all()) {
      tagMap[row.name] = row.id;
    }

    // Link bookmark tags
    linkTag.run('bookmark', b1.lastInsertRowid, tagMap['react']);
    linkTag.run('bookmark', b1.lastInsertRowid, tagMap['javascript']);
    linkTag.run('bookmark', b1.lastInsertRowid, tagMap['frontend']);

    linkTag.run('bookmark', b2.lastInsertRowid, tagMap['sqlite']);
    linkTag.run('bookmark', b2.lastInsertRowid, tagMap['sql']);
    linkTag.run('bookmark', b2.lastInsertRowid, tagMap['database']);
    linkTag.run('bookmark', b2.lastInsertRowid, tagMap['performance']);

    linkTag.run('bookmark', b3.lastInsertRowid, tagMap['css']);
    linkTag.run('bookmark', b3.lastInsertRowid, tagMap['frontend']);
    linkTag.run('bookmark', b3.lastInsertRowid, tagMap['design']);

    linkTag.run('bookmark', b4.lastInsertRowid, tagMap['finanzas']);
    linkTag.run('bookmark', b4.lastInsertRowid, tagMap['etf']);
    linkTag.run('bookmark', b4.lastInsertRowid, tagMap['ahorro']);

    // Link note tags
    linkTag.run('note', n1.lastInsertRowid, tagMap['react']);
    linkTag.run('note', n1.lastInsertRowid, tagMap['frontend']);
    linkTag.run('note', n1.lastInsertRowid, tagMap['javascript']);

    linkTag.run('note', n2.lastInsertRowid, tagMap['sqlite']);
    linkTag.run('note', n2.lastInsertRowid, tagMap['database']);
    linkTag.run('note', n2.lastInsertRowid, tagMap['performance']);

    linkTag.run('note', n3.lastInsertRowid, tagMap['finanzas']);
    linkTag.run('note', n3.lastInsertRowid, tagMap['etf']);
    linkTag.run('note', n3.lastInsertRowid, tagMap['ahorro']);

    // Manual link between b1 and n1
    linkManual.run(b1.lastInsertRowid, n1.lastInsertRowid, 'Enlace de referencia de estudio para React 19', now);
  });

  tx();
  console.log('Sample data seeded successfully.');
}

function runMigrations() {
  const bmCols = db.prepare("PRAGMA table_info(bookmarks)").all().map(c => c.name);
  if (!bmCols.includes('theme')) {
    db.exec("ALTER TABLE bookmarks ADD COLUMN theme TEXT DEFAULT ''");
    if (bmCols.includes('reason')) {
      db.exec("UPDATE bookmarks SET theme = COALESCE(reason, '') WHERE theme = '' OR theme IS NULL");
    }
  }
  if (bmCols.includes('reason')) {
    db.exec("UPDATE bookmarks SET theme = COALESCE(NULLIF(theme, ''), reason, '') WHERE theme = '' OR theme IS NULL");
  }
  if (!bmCols.includes('color')) {
    db.exec("ALTER TABLE bookmarks ADD COLUMN color TEXT DEFAULT '#10b981'");
  }
  if (!bmCols.includes('icon')) {
    db.exec("ALTER TABLE bookmarks ADD COLUMN icon TEXT DEFAULT 'bookmark'");
  }
  if (!bmCols.includes('deleted_at')) {
    db.exec("ALTER TABLE bookmarks ADD COLUMN deleted_at TEXT DEFAULT NULL");
  }

  const noteCols = db.prepare("PRAGMA table_info(notes)").all().map(c => c.name);
  if (!noteCols.includes('theme')) {
    db.exec("ALTER TABLE notes ADD COLUMN theme TEXT DEFAULT ''");
    if (noteCols.includes('reason')) {
      db.exec("UPDATE notes SET theme = COALESCE(reason, '') WHERE theme = '' OR theme IS NULL");
    }
  }
  if (noteCols.includes('reason')) {
    db.exec("UPDATE notes SET theme = COALESCE(NULLIF(theme, ''), reason, '') WHERE theme = '' OR theme IS NULL");
  }
  if (!noteCols.includes('deleted_at')) {
    db.exec("ALTER TABLE notes ADD COLUMN deleted_at TEXT DEFAULT NULL");
  }

  // Orphan cleanup: only removes item_tags links whose parent row no longer exists.
  // Safe to run repeatedly; links whose parent still exists (including soft-deleted
  // parents in the trash) are left untouched, and tags vocabulary rows are never deleted.
  // Both DELETEs run inside one transaction so the cleanup is all-or-nothing instead
  // of two independent autocommit statements.
  db.transaction(() => {
    db.exec(`
      DELETE FROM item_tags
      WHERE item_type = 'bookmark'
        AND NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.id = item_tags.item_id);

      DELETE FROM item_tags
      WHERE item_type = 'note'
        AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.id = item_tags.item_id);
    `);
  })();
}

// Auto-initialize DB and ensure migrations on import
initDb();
