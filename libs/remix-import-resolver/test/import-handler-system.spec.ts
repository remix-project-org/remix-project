/// <reference types="mocha" />
/**
 * Import Handler System Tests
 *
 * Demonstrates the pattern-based import handler system
 */

import { expect } from 'chai'
import { ImportHandler, ImportHandlerContext, ImportHandlerResult } from '../src/handlers/import-handler-interface'
import { ImportHandlerRegistry } from '../src/handlers/import-handler-registry'
import { RemixTestLibsHandler } from '../src/handlers/remix-test-libs-handler'
import { CustomTemplateHandler } from '../src/handlers/custom-template-handler'

describe('Import Handler System', () => {

  describe('ImportHandlerRegistry', () => {
    let registry: ImportHandlerRegistry

    beforeEach(() => {
      registry = new ImportHandlerRegistry(true)
    })

    it('should register and execute handlers by priority', async () => {
      const results: string[] = []

      // Low priority handler
      class LowPriorityHandler extends ImportHandler {
        constructor() { super('test.sol') }
        getPriority() { return 10 }
        async handle(ctx: ImportHandlerContext): Promise<ImportHandlerResult> {
          results.push('low')
          return { handled: false }
        }
      }

      // High priority handler
      class HighPriorityHandler extends ImportHandler {
        constructor() { super('test.sol') }
        getPriority() { return 100 }
        async handle(ctx: ImportHandlerContext): Promise<ImportHandlerResult> {
          results.push('high')
          return { handled: true, content: 'handled by high priority' }
        }
      }

      registry.register(new LowPriorityHandler())
      registry.register(new HighPriorityHandler())

      const result = await registry.tryHandle({
        importPath: 'test.sol',
        targetFile: 'main.sol'
      })

      expect(result?.handled).to.equal(true)
      expect(result?.content).to.equal('handled by high priority')
      expect(results).to.deep.equal(['high']) // Low priority shouldn't run if high handles it
    })

    it('should match wildcard patterns', async () => {
      class WildcardHandler extends ImportHandler {
        constructor() { super('remix_*.sol') }
        async handle(ctx: ImportHandlerContext): Promise<ImportHandlerResult> {
          return { handled: true, content: `Matched: ${ctx.importPath}` }
        }
      }

      registry.register(new WildcardHandler())

      const result1 = await registry.tryHandle({
        importPath: 'remix_tests.sol',
        targetFile: 'main.sol'
      })
      expect(result1?.handled).to.equal(true)

      const result2 = await registry.tryHandle({
        importPath: 'remix_accounts.sol',
        targetFile: 'main.sol'
      })
      expect(result2?.handled).to.equal(true)

      const result3 = await registry.tryHandle({
        importPath: 'other.sol',
        targetFile: 'main.sol'
      })
      expect(result3).to.be.null
    })

    it('should match regex patterns', async () => {
      class RegexHandler extends ImportHandler {
        constructor() { super(/^@openzeppelin\/.*\.sol$/) }
        async handle(ctx: ImportHandlerContext): Promise<ImportHandlerResult> {
          return { handled: true, content: 'OpenZeppelin import' }
        }
      }

      registry.register(new RegexHandler())

      const result = await registry.tryHandle({
        importPath: '@openzeppelin/contracts/token/ERC20/ERC20.sol',
        targetFile: 'main.sol'
      })
      expect(result?.handled).to.equal(true)
    })
  })

  describe('RemixTestLibsHandler', () => {
    it('should match remix_tests.sol and remix_accounts.sol patterns', () => {
      const mockIO = {
        exists: async () => false,
        readFile: async () => '',
        writeFile: async () => {}
      }

      const testContent = '// remix_tests.sol content'
      const accountsContent = '// remix_accounts.sol content'

      const handler = new RemixTestLibsHandler({
        io: mockIO as any,
        testLibContent: testContent,
        accountsLibContent: accountsContent,
        debug: false
      })

      expect(handler.canHandle('remix_tests.sol')).to.equal(true)
      expect(handler.canHandle('remix_accounts.sol')).to.equal(true)
      expect(handler.canHandle('other.sol')).to.equal(false)
    })

    it('should generate content when files do not exist', async () => {
      const files: Record<string, string> = {}
      const mockIO = {
        exists: async (path: string) => path in files,
        readFile: async (path: string) => files[path] || '',
        writeFile: async (path: string, content: string) => { files[path] = content }
      }

      const testContent = '// remix_tests.sol content'

      const handler = new RemixTestLibsHandler({
        io: mockIO as any,
        testLibContent: testContent,
        debug: false
      })

      const result = await handler.handle({
        importPath: 'remix_tests.sol',
        targetFile: 'MyTest.sol'
      })

      expect(result.handled).to.equal(true)
      expect(result.content).to.equal(testContent)
      expect(files['.deps/remix-tests/remix_tests.sol']).to.equal(testContent)
    })

    it('should use existing files when available', async () => {
      const existingContent = '// Existing cached content'
      const files: Record<string, string> = {
        '.deps/remix-tests/remix_tests.sol': existingContent
      }
      const mockIO = {
        exists: async (path: string) => path in files,
        readFile: async (path: string) => files[path] || '',
        writeFile: async (path: string, content: string) => { files[path] = content }
      }

      const handler = new RemixTestLibsHandler({
        io: mockIO as any,
        testLibContent: '// New content',
        debug: false
      })

      const result = await handler.handle({
        importPath: 'remix_tests.sol',
        targetFile: 'MyTest.sol'
      })

      expect(result.handled).to.equal(true)
      expect(result.content).to.equal(existingContent)
      expect(Object.keys(files)).to.have.lengthOf(1) // No new files written
    })
  })

  describe('CustomTemplateHandler', () => {
    it('should generate content from template function', async () => {
      const files: Record<string, string> = {}
      const mockIO = {
        writeFile: async (path: string, content: string) => { files[path] = content }
      }

      const handler = new CustomTemplateHandler(
        /^templates\/.*\.sol$/,
        {
          io: mockIO as any,
          templateGenerator: (importPath) => {
            const name = importPath.replace('templates/', '').replace('.sol', '')
            return `contract ${name} {}`
          },
          debug: false
        }
      )

      expect(handler.canHandle('templates/MyContract.sol')).to.equal(true)
      expect(handler.canHandle('other.sol')).to.equal(false)

      const result = await handler.handle({
        importPath: 'templates/MyContract.sol',
        targetFile: 'main.sol'
      })

      expect(result.handled).to.equal(true)
      expect(result.content).to.equal('contract MyContract {}')
      expect(files['.deps/custom/templates/MyContract.sol']).to.equal('contract MyContract {}')
    })
  })

  describe('Integration Example', () => {
    it('should demonstrate complete handler workflow', async () => {
      const registry = new ImportHandlerRegistry(true)
      const handledImports: string[] = []

      // Handler 1: Remix test libs (high priority)
      class TestLibHandler extends ImportHandler {
        constructor() { super(/^remix_.*\.sol$/) }
        getPriority() { return 100 }
        async handle(ctx: ImportHandlerContext): Promise<ImportHandlerResult> {
          handledImports.push(`test-lib:${ctx.importPath}`)
          return { handled: true, content: `// Generated ${ctx.importPath}` }
        }
      }

      // Handler 2: OpenZeppelin imports (medium priority)
      class OZHandler extends ImportHandler {
        constructor() { super(/^@openzeppelin\//) }
        getPriority() { return 50 }
        async handle(ctx: ImportHandlerContext): Promise<ImportHandlerResult> {
          handledImports.push(`oz:${ctx.importPath}`)
          return { handled: true, content: '// OpenZeppelin import' }
        }
      }

      registry.register(new TestLibHandler())
      registry.register(new OZHandler())

      // Test remix import
      const result1 = await registry.tryHandle({
        importPath: 'remix_tests.sol',
        targetFile: 'test.sol'
      })
      expect(result1?.handled).to.equal(true)
      expect(handledImports).to.include('test-lib:remix_tests.sol')

      // Test OpenZeppelin import
      const result2 = await registry.tryHandle({
        importPath: '@openzeppelin/contracts/token/ERC20/ERC20.sol',
        targetFile: 'main.sol'
      })
      expect(result2?.handled).to.equal(true)
      expect(handledImports).to.include('oz:@openzeppelin/contracts/token/ERC20/ERC20.sol')

      // Test unhandled import
      const result3 = await registry.tryHandle({
        importPath: 'MyContract.sol',
        targetFile: 'main.sol'
      })
      expect(result3).to.be.null
    })
  })
})
