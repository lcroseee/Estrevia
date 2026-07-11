import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Allow the `{ node, ...props }` omit-a-prop pattern: react-markdown passes
      // a `node` prop to every custom component and we strip it before spreading
      // onto the DOM. ignoreRestSiblings makes the discarded sibling lint-clean.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // React Hooks v7 (Next 16) rules — downgrade to warnings until existing
      // effects/components are refactored. Not blocking for production.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
];
