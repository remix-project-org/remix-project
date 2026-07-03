/* eslint-disable no-useless-escape */
/**
 * GraphQL/Subgraph Monarch Tokenizer for Monaco Editor
 * Based on: https://github.com/Microsoft/monaco-languages/pull/54
 */

export const subgraphLanguageConfig = {
  comments: {
    lineComment: '#',
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"""', close: '"""', notIn: ['string', 'comment']},
    { open: '"', close: '"', notIn: ['string', 'comment']},
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"""', close: '"""' },
    { open: '"', close: '"' },
  ],
  folding: {
    offSide: true,
  },
}

export const subgraphTokensProvider = {
  defaultToken: 'invalid',
  tokenPostfix: '.subgraph',

  keywords: [
    'null',
    'true',
    'false',
    'query',
    'mutation',
    'subscription',
    'extend',
    'schema',
    'directive',
    'scalar',
    'type',
    'interface',
    'union',
    'enum',
    'input',
    'implements',
    'fragment',
    'on',
  ],

  typeKeywords: ['Int', 'Float', 'String', 'Boolean', 'ID', 'BigInt', 'BigDecimal', 'Bytes'],

  directiveLocations: [
    'SCHEMA',
    'SCALAR',
    'OBJECT',
    'FIELD_DEFINITION',
    'ARGUMENT_DEFINITION',
    'INTERFACE',
    'UNION',
    'ENUM',
    'ENUM_VALUE',
    'INPUT_OBJECT',
    'INPUT_FIELD_DEFINITION',
    'QUERY',
    'MUTATION',
    'SUBSCRIPTION',
    'FIELD',
    'FRAGMENT_DEFINITION',
    'FRAGMENT_SPREAD',
    'INLINE_FRAGMENT',
    'VARIABLE_DEFINITION',
  ],

  operators: ['=', '!', '?', ':', '&', '|', '...'],

  symbols: /[=!?:&|]+/,

  escapes: /\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4})/,

  tokenizer: {
    root: [
      // Comments (must be before other rules)
      [/#.*$/, 'comment'],

      // Whitespace
      [/[ \t\r\n]+/, ''],

      // Variable references ($varName)
      [/\$[a-zA-Z_][a-zA-Z0-9_]*/, 'variable'],

      // Directives (@directive)
      [/@[a-zA-Z_][a-zA-Z0-9_]*/, 'annotation'],

      // Spread operator
      [/\.\.\./, 'operator'],

      // Identifiers and keywords
      [
        /[a-z_][a-zA-Z0-9_]*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        },
      ],

      // Type identifiers (PascalCase)
      [
        /[A-Z][a-zA-Z0-9_]*/,
        {
          cases: {
            '@typeKeywords': 'keyword',
            '@directiveLocations': 'keyword',
            '@default': 'type.identifier',
          },
        },
      ],

      // Brackets
      [/[{}()\[\]]/, '@brackets'],

      // Operators and symbols
      [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],

      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d+/, 'number'],

      // Delimiters
      [/[;,.]/, 'delimiter'],

      // Block strings (triple quotes)
      [/"""/, { token: 'string', next: '@mlstring' }],

      // Invalid strings (unclosed)
      [/"([^"\\]|\\.)*$/, 'string.invalid'],

      // Regular strings
      [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
    ],

    // Multi-line string state
    mlstring: [
      [/[^"]+/, 'string'],
      [/"""/, { token: 'string', next: '@pop' }],
      [/"/, 'string'],
    ],

    // Regular string state
    string: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],
  },
}
