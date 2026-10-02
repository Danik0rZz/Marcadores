/**
 * The subset of the better-sqlite3 API used by the server modules, on top of
 * a sql.js (SQLite compiled to WebAssembly) database. With it, the server's
 * route table, matching and schema code runs unchanged in the browser.
 *
 * The wrapped sql.js database can be swapped (`replace`) without changing the
 * object other modules imported, e.g. when another tab saved newer data.
 */

function toSqlValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return Number(value);
  return value;
}

// better-sqlite3 binds either positional args or one object of @named params.
function bindArgs(args) {
  const [first] = args;
  if (
    args.length === 1 &&
    first !== null &&
    typeof first === 'object' &&
    !Array.isArray(first) &&
    !(first instanceof Uint8Array)
  ) {
    const named = {};
    for (const [key, value] of Object.entries(first)) named[`@${key}`] = toSqlValue(value);
    return named;
  }
  return args.map(toSqlValue);
}

/**
 * @param {import('sql.js').Database} initialDatabase
 */
export function createSqliteAdapter(initialDatabase) {
  let sqlDb = initialDatabase;
  let transactionDepth = 0;

  function lastInsertRowid() {
    return sqlDb.exec('SELECT last_insert_rowid()')[0].values[0][0];
  }

  function withStatement(sql, args, read) {
    const statement = sqlDb.prepare(sql);
    try {
      statement.bind(bindArgs(args));
      return read(statement);
    } finally {
      statement.free();
    }
  }

  const adapter = {
    prepare(sql) {
      return {
        get: (...args) => withStatement(sql, args, st => (st.step() ? st.getAsObject() : undefined)),
        all: (...args) => withStatement(sql, args, st => {
          const rows = [];
          while (st.step()) rows.push(st.getAsObject());
          return rows;
        }),
        run: (...args) => {
          withStatement(sql, args, st => {
            st.step();
          });
          return { changes: sqlDb.getRowsModified(), lastInsertRowid: lastInsertRowid() };
        }
      };
    },

    exec(sql) {
      sqlDb.exec(sql);
      return adapter;
    },

    pragma(source, options = {}) {
      const result = sqlDb.exec(`PRAGMA ${source}`);
      if (options.simple) return result[0]?.values[0]?.[0];
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
    },

    /**
     * Like better-sqlite3: all-or-nothing, and nesting works. Savepoints at
     * every level: outside a transaction SQLite's SAVEPOINT starts one (and
     * RELEASE commits it); inside one, also a manual BEGIN, it nests.
     */
    transaction(fn) {
      return (...args) => {
        const savepoint = `nexus_tx_${transactionDepth}`;
        sqlDb.exec(`SAVEPOINT ${savepoint}`);
        transactionDepth += 1;
        try {
          const result = fn(...args);
          sqlDb.exec(`RELEASE ${savepoint}`);
          return result;
        } catch (err) {
          sqlDb.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
          throw err;
        } finally {
          transactionDepth -= 1;
        }
      };
    },

    get inTransaction() {
      return transactionDepth > 0;
    },

    /** Serialized database file (for persistence and backups). */
    export() {
      const bytes = sqlDb.export();
      // sql.js re-opens the database on export, which resets pragmas.
      sqlDb.exec('PRAGMA foreign_keys = ON');
      return bytes;
    },

    close() {
      sqlDb.close();
    },

    replace(nextDatabase) {
      sqlDb.close();
      sqlDb = nextDatabase;
      sqlDb.exec('PRAGMA foreign_keys = ON');
    }
  };

  return adapter;
}
