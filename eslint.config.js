import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'dist_release/**',
      'dist_release_candidate/**',
      'node_modules/**',
      'helper/**',
      'coverage/**',
      'build/**',
      'src/**',
      '*.config.js'
    ]
  },
  {
    files: ['app/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-constant-condition': 'warn',
      'no-debugger': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }]
    }
  }
];
