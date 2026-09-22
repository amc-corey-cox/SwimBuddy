import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      'node_modules/',
      // Generated from schema/swimbuddy.yaml; lint it and you are linting the
      // generator's style, not ours.
      'src/core/model.ts',
    ],
  },

  js.configs.recommended,

  // Type-aware rules apply to TypeScript only; plain JS config files have no project.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Node scripts: no TypeScript project, but they do get Node globals.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Application code: browser globals, typechecked against the app project.
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Build tooling: Node globals, typechecked against the node project.
  {
    files: ['vite.config.ts', 'playwright.config.ts', 'scripts/service-worker-plugin.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // End-to-end specs drive a browser, so their evaluate() callbacks need DOM types.
  {
    files: ['e2e/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        project: ['./tsconfig.e2e.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // The architecture rule that matters most in this project: src/core/ must stay
  // pure, so it can run unchanged in a future sync server. No DOM, no storage.
  // See CLAUDE.md "Future backend".
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'document',
          message: 'src/core/ must stay DOM-free — see CLAUDE.md "Future backend".',
        },
        {
          name: 'window',
          message: 'src/core/ must stay DOM-free — see CLAUDE.md "Future backend".',
        },
        {
          name: 'navigator',
          message: 'src/core/ must stay DOM-free — see CLAUDE.md "Future backend".',
        },
        {
          name: 'localStorage',
          message:
            'src/core/ must stay storage-free, and localStorage is never used for real data.',
        },
        {
          name: 'sessionStorage',
          message:
            'src/core/ must stay storage-free, and sessionStorage is never used for real data.',
        },
        {
          name: 'indexedDB',
          message: 'src/core/ must stay storage-free — storage access goes through src/storage/.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'idb', message: 'Only src/storage/ may touch IndexedDB.' }],
          patterns: [
            {
              group: ['**/storage/**', '**/ui/**'],
              message: 'src/core/ may not import storage or UI — dependencies point inward.',
            },
          ],
        },
      ],
    },
  },

  // Tests and fixtures are allowed to be more relaxed about non-null assertions.
  {
    files: ['src/**/*.test.ts', 'src/fixtures/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Must stay last: turns off stylistic rules that would fight Prettier.
  prettier,
)
