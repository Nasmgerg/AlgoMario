import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base: works locally and on GitHub Pages regardless of repo
  // name, which isn't known yet (no remote configured). Switch to
  // '/<repo-nev>/' once the repo is created, per SPEC.md 10. szakasz.
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
