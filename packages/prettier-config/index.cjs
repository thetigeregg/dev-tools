module.exports = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',
  trailingComma: 'es5',
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  htmlWhitespaceSensitivity: 'ignore',
  overrides: [
    {
      files: '*.html',
      options: {
        parser: 'angular',
      },
    },
    {
      files: '*.y?(a)ml',
      options: {
        singleQuote: false,
        printWidth: 120,
      },
    },
    {
      files: '*.md',
      options: {
        proseWrap: 'preserve',
      },
    },
    {
      files: '*.json',
      options: {
        trailingComma: 'none',
      },
    },
    {
      files: ['docker-compose*.yml', 'compose*.yml'],
      options: {
        singleQuote: false,
      },
    },
  ],
};
