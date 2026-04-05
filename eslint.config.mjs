import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    files: [
      'apps/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
      'packages/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
      'infra/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
);
