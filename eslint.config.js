import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const project = (name) => ({
  ecmaVersion: 2023,
  parserOptions: { project: [`./tools/tsconfig.${name}.json`], tsconfigRootDir: import.meta.dirname },
});

export default defineConfig([
  { ignores: ['**/node_modules/**', '**/dist/**', 'previews/**', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/shared/**/*.ts'],
    languageOptions: { ...project('shared'), globals: {} },
    rules: {
      // Shared code runs on the client, the server and in tests: no platform APIs.
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@devvit/*', 'react', 'react-dom', 'hono'], message: 'Shared code must stay platform-free.' }] },
      ],
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    ignores: ['src/shared/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*', '@devvit/*', 'react', 'react-dom', 'hono'], message: 'Shared code must stay platform-free.' }] },
      ],
    },
  },
  {
    files: ['src/server/**/*.ts'],
    languageOptions: { ...project('server'), globals: globals.node },
  },
  {
    files: ['src/client/**/*.{ts,tsx}'],
    languageOptions: { ...project('client'), globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/server/**'], message: 'The client must not import server code.' }] },
      ],
    },
  },
  {
    files: ['tools/**/*.ts', 'vite.config.ts', 'vite.lab.config.ts'],
    languageOptions: { ...project('tools'), globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        // node:test registers tests through promises the runner itself awaits.
        { allowForKnownSafeCalls: [{ from: 'package', name: ['test', 'describe', 'it'], package: 'node:test' }] },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
]);
