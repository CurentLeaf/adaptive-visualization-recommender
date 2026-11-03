import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { studyDependencyAliases } from './src/viteAliases';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..');
let sourceCommit = process.env.VITE_SOURCE_COMMIT;
if (!sourceCommit) {
  try {
    sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    sourceCommit = 'unknown';
  }
}

export default defineConfig({
  root: directory,
  base: process.env.GITHUB_ACTIONS === 'true' ? '/adaptive-visualization-recommender/study/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: studyDependencyAliases(path.join(directory, 'node_modules')) },
  define: { __SOURCE_COMMIT__: JSON.stringify(sourceCommit) },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
