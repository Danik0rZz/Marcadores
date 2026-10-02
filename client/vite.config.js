import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const clientDir = path.dirname(fileURLToPath(import.meta.url))
// normalizePath: Vite ids use forward slashes, also on Windows
const serverDir = normalizePath(path.resolve(clientDir, '../server'))
const browserDb = normalizePath(path.resolve(clientDir, 'src/backend/browserDb.js'))

// The GitHub Pages build bundles the server's route table and runs it in the
// page. Its `import { db } from './db.js'` (better-sqlite3, Node only) is
// swapped for the in-browser SQLite database.
function browserDatabase() {
  return {
    name: 'nexus-browser-database',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './db.js' && importer && path.posix.dirname(normalizePath(importer)) === serverDir) {
        return browserDb
      }
      // Node-only native module: reaching it means the swap above failed.
      if (source === 'better-sqlite3') {
        this.error(`better-sqlite3 cannot run in the browser (imported by ${importer})`)
      }
      return null
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), browserDatabase()],
  // Which API backend the client uses. Set here, not in an .env file: .env*
  // files are git-ignored, and CI must build the same thing as a local run.
  define: {
    'import.meta.env.VITE_BACKEND': JSON.stringify(mode === 'pages' ? 'browser' : 'server')
  },
  // Pages serves the app from /<repo>/: relative asset paths work anywhere.
  base: mode === 'pages' ? './' : '/',
  build: {
    outDir: mode === 'pages' ? 'dist-pages' : 'dist',
    // Top-level await in the browser database module
    target: 'es2022'
  },
  server: {
    port: 5173,
    // The Pages build imports ../server modules
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  }
}))
