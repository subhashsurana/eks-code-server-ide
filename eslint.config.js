const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const security = require('eslint-plugin-security');

module.exports = [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      security: security,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      'security/detect-object-injection': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
    },
  },
];