import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Components must go through src/api/ (see CLAUDE.md).
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'axios', message: 'Call the backend only through src/api/.' }] },
      ],
    },
  },
  { files: ['src/api/**'], rules: { 'no-restricted-imports': 'off' } },
  // shadcn files export variants next to components; providers export their hook; the router holds lazy pages.
  {
    files: ['src/components/ui/**', 'src/app/**', 'src/auth/AuthProvider.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
