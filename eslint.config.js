import prettier from '@vue/eslint-config-prettier'
import vitest from '@vitest/eslint-plugin'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '**/*.tsbuildinfo'],
  },

  tseslint.configs.recommended,
  pluginVue.configs['flat/recommended'],

  {
    files: ['src/**/*.{ts,mts,cts}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.vitest.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Los bloques <script> de .vue se lintean con el parser de TypeScript pero sin
  // `project`: TypeScript no soporta la extensión .vue, así que el archivo no
  // aparece en ningún programa y `project` fallaría al buscarlo.
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        project: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['src/**/*.{ts,mts,cts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },

  {
    files: ['src/**/*.vue'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },

  {
    files: ['*.config.ts', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: globals.browser,
    },
  },

  {
    files: ['src/__tests__/**/*.ts'],
    ...vitest.configs.recommended,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  prettier,
)
