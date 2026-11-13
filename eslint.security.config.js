import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

// Deliberately scoped rules, not a claim of complete OWASP Top 10 coverage.
// Generic dynamic-path/object-access heuristics need a separate manual review:
// CI tooling legitimately uses bounded paths and lookup tables extensively.
export const securityConfig = [
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: { noInlineConfig: true },
    plugins: { security },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-bidi-characters': 'error',
      'no-restricted-syntax': ['error', {
        selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
        message: 'Raw HTML insertion requires a separate reviewed sanitization design.',
      }],
    },
  },
];

export default securityConfig;
