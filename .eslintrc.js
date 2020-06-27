module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'airbnb-base',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.ts']
      }
    }
  },
  plugins: [],
  rules: {
    'max-len': 'error',
    'no-underscore-dangle': 'off',
    'comma-dangle': 'off',
    'space-before-function-paren': 'off',
    'func-names': 'off',
    'object-shorthand': 'off',
    'prefer-arrow-callback': 'off',
    'consistent-return': 'off',
    'no-use-before-define': 'off',
    'guard-for-in': 'off',
    'no-restricted-syntax': 'off',
    'no-continue': 'off',
    'prefer-template': 'off',
    'newline-per-chained-call': 'off',
    'linebreak-style': 'off',
    'arrow-parens': 'off',
    'no-unused-expressions': 'off',
    'no-param-reassign': 'off',
    'no-nested-ternary': 'off',
    'one-var-declaration-per-line': 'off',
    'one-var': 'off',
    'prefer-destructuring': 'off',
    'prefer-object-spread': 'off',
    'import/extensions': 'off',
    'import/prefer-default-export': 'off'
  },
  env: {
    node: true,
    mocha: true
  }
}