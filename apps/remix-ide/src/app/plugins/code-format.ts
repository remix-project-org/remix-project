'use strict'
import { Plugin } from '@remixproject/engine'
import { Options } from 'prettier'
import path from 'path'
import yaml from 'js-yaml'
import toml from 'toml'
import { filePathFilter, AnyFilter } from '@jsdevtools/file-path-filter'

const profile = {
  name: 'codeFormatter',
  description: 'prettier plugin for Remix',
  methods: ['format', 'preloadPrettier'],
  events: [''],
  version: '0.0.1'
}

const defaultOptions = {
  "overrides": [
    {
      "files": "*.sol",
      "options": {
        "printWidth": 80,
        "tabWidth": 4,
        "useTabs": false,
        "singleQuote": false,
        "bracketSpacing": false,
      }
    },
    {
      "files": "*.yml",
      "options": {
      }
    },
    {
      "files": "*.yaml",
      "options": {
      }
    },
    {
      "files": "*.toml",
      "options": {
      }
    },
    {
      "files": "*.json",
      "options": {
      }
    },
    {
      "files": "*.js",
      "options": {
      }
    },
    {
      "files": "*.ts",
      "options": {
      }
    }
  ]
}

export class CodeFormat extends Plugin {

  prettier: any
  ts: any
  babel: any
  espree: any
  yml: any
  sol: any
  preloadPromise: Promise<void> | null = null

  constructor() {
    super(profile)
  }

  /**
   * Preload prettier and its plugins to improve first-format performance
   * Can be called when the editor finishes loading
   */
  async preloadPrettier() {
    // Prevent multiple simultaneous preload calls
    if (this.preloadPromise) {
      return this.preloadPromise
    }

    // If already loaded, return immediately
    if (this.prettier) {
      return Promise.resolve()
    }

    this.preloadPromise = (async () => {
      try {
        this.prettier = await import('prettier/standalone')
        this.ts = await import('prettier/parser-typescript')
        this.babel = await import('prettier/parser-babel')
        this.espree = await import('prettier/parser-espree')
        this.yml = await import('prettier/parser-yaml')
        this.sol = (await import('prettier-plugin-solidity')).default
      } catch (error) {
        console.error('Error preloading prettier:', error)
        // Reset so it can be retried
        this.preloadPromise = null
        throw error
      }
    })()

    return this.preloadPromise
  }

  async format(file: string, content?: string, onlyReturn?: boolean) {

    // lazy load if not already preloaded
    if (!this.prettier) {
      this.prettier = await import('prettier/standalone')
      this.ts = await import('prettier/parser-typescript')
      this.babel = await import('prettier/parser-babel')
      this.espree = await import('prettier/parser-espree')
      this.yml = await import('prettier/parser-yaml')
      this.sol = (await import('prettier-plugin-solidity')).default
    }

    try {
      if (!content) content = await this.call('fileManager', 'readFile', file)
      if (!content) return
      let parserName = ''
      let options: Options = {
      }
      switch (path.extname(file)) {
      case '.sol':
        parserName = 'slang'
        break
      case '.ts':
        parserName = 'typescript'
        options = {
          ...options,
          trailingComma: 'all',
          semi: false,
          singleQuote: true,
          quoteProps: 'as-needed',
          bracketSpacing: true,
          arrowParens: 'always',
        }
        break
      case '.js':
        parserName = "espree"
        options = {
          ...options,
          semi: false,
          singleQuote: true,
        }
        break
      case '.json':
        parserName = 'json'
        break
      case '.yml':
        parserName = 'yaml'
        break
      case '.yaml':
        parserName = 'yaml'
        break
      }

      if (file === '.prettierrc') {
        parserName = 'json'
      }

      const possibleFileNames = [
        '.prettierrc',
        '.prettierrc.json',
        '.prettierrc.yaml',
        '.prettierrc.yml',
        '.prettierrc.toml',
        '.prettierrc.js',
        '.prettierrc.cjs',
        'prettier.config.js',
        'prettier.config.cjs',
        '.prettierrc.json5',
      ]

      const prettierConfigFile = await findAsync(possibleFileNames, async (fileName) => {
        const exists = await this.call('fileManager', 'exists', fileName)
        return exists
      })

      let parsed = null
      if (prettierConfigFile) {
        let prettierConfig = await this.call('fileManager', 'readFile', prettierConfigFile)
        if (prettierConfig) {
          if (prettierConfigFile.endsWith('.yaml') || prettierConfigFile.endsWith('.yml')) {
            try {
              parsed = yaml.load(prettierConfig)
            } catch (e) {
              // do nothing
            }
          } else if (prettierConfigFile.endsWith('.toml')) {
            try {
              parsed = toml.parse(prettierConfig)
            } catch (e) {
              // do nothing
            }
          } else if (prettierConfigFile.endsWith('.json') || prettierConfigFile.endsWith('.json5')) {
            try {
              parsed = JSON.parse(prettierConfig)
            } catch (e) {
              // do nothing
            }
          } else if (prettierConfigFile === '.prettierrc') {
            try {
              parsed = JSON.parse(prettierConfig)
            } catch (e) {
              // do nothing
            }
            if (!parsed) {
              try {
                parsed = yaml.load(prettierConfig)
              } catch (e) {
                // do nothing
              }
            }
          } else if (prettierConfigFile.endsWith('.js') || prettierConfigFile.endsWith('.cjs')) {
            // remove any comments
            prettierConfig = prettierConfig.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '')
            // add quotes to keys
            prettierConfig = prettierConfig.replace(/([a-zA-Z0-9_]+)(\s*):/g, '"$1"$2:')
            // remove comma from last key
            prettierConfig = prettierConfig.replace(/,(\s*})/g, '$1')
            // remove any semi-colons
            prettierConfig = prettierConfig.replace(/;/g, '')
            // convert single quotes to double quotes
            prettierConfig = prettierConfig.replace(/'/g, '"')
            try {
              parsed = JSON.parse(prettierConfig.replace('module.exports = ', '').replace('module.exports=', ''))
            } catch (e) {
              // do nothing
            }
          }
        }
      } else {
        parsed = defaultOptions
        await this.call('fileManager', 'writeFile', '.prettierrc.json', JSON.stringify(parsed, null, 2))
        await this.call('notification', 'toast', 'A prettier config file has been created in the workspace.')
      }

      if (!parsed && prettierConfigFile) {
        this.call('notification', 'toast', `Error parsing prettier config file: ${prettierConfigFile}`)
      }

      // merge options
      if (parsed) {
        options = {
          ...options,
          ...parsed,
        }
      }

      // search for overrides
      if (parsed && parsed.overrides) {
        const override = parsed.overrides.find((override) => {
          if (override.files) {
            const pathFilter: AnyFilter = {}
            pathFilter.include = setGlobalExpression(override.files)
            const filteredFiles = [file]
              .filter(filePathFilter(pathFilter))
            if (filteredFiles.length) {
              return true
            }
          }
        })
        const validParsers = ['typescript', 'babel', 'espree', 'json', 'yaml', 'slang']
        if (override && override.options && override.options.parser) {
          if (validParsers.includes(override.options.parser)) {
            parserName = override.options.parser
          } else {
            this.call('notification', 'toast', `Invalid parser: ${override.options.parser}! Valid options are ${validParsers.join(', ')}`)
          }
          delete override.options.parser
        }

        if (override) {
          options = {
            ...options,
            ...override.options,
          }
        }
      }

      const result = await this.prettier.format(content, {
        plugins: [this.sol, this.ts, this.babel, this.espree, this.yml],
        parser: parserName,
        ...options
      })
      if (!onlyReturn) {
        await this.call('fileManager', 'writeFile', file, result)
      }
      return result
    } catch (e) {
      // do nothing
      console.error(e)
    }
  }

}

//*.sol, **/*.txt, contracts/*
const setGlobalExpression = (paths: string) => {
  const results = []
  paths.split(',').forEach(path => {
    path = path.trim()
    if (path.startsWith('*.')) path = path.replace(/(\*\.)/g, '**/*.')
    if (path.endsWith('/*') && !path.endsWith('/**/*'))
      path = path.replace(/(\*)/g, '**/*.*')
    results.push(path)
  })
  return results
}

async function findAsync(arr, asyncCallback) {
  const promises = arr.map(asyncCallback);
  const results = await Promise.all(promises);
  const index = results.findIndex(result => result);
  return arr[index];
}
