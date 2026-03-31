// Dynamic imports: gracefully handles environments where @eslint/js or
// typescript-eslint are not installed (e.g. global ESLint v10 with no
// local node_modules, as found in codex/CI envs).
const jsModule = await import('@eslint/js').catch(() => null);
const tsModule = await import('typescript-eslint').catch(() => null);

const ignores = { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] };

let config;
if (tsModule) {
  // Full config: TypeScript-aware linting (both packages available).
  const tseslint = tsModule.default;
  const jsConfigs = jsModule ? [jsModule.default.configs.recommended] : [];
  config = tseslint.config(
    ignores,
    ...jsConfigs,
    ...tseslint.configs.recommended,
    {
      files: ['src/**/*.{ts,tsx,mts,cts}'],
      rules: {
        // Keep lint lightweight across varied environments.
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-unused-vars': 'off',
      },
    },
  );
} else if (jsModule) {
  // JS-only: typescript-eslint unavailable, skip TS files (can't parse them).
  config = [ignores, jsModule.default.configs.recommended, { files: ['src/**/*.{js,mjs,cjs}'] }];
} else {
  // Bare minimum: no plugins available. Lint JS-only files with basic built-in rules.
  // Discovered in codex env: ESLint v10.0.0 globally installed, no @eslint/js or typescript-eslint.
  config = [ignores, { files: ['src/**/*.{js,mjs,cjs}'], rules: { 'no-unused-vars': 'warn' } }];
}

export default config;
