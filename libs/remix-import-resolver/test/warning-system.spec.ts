/// <reference types="mocha" />
import { expect } from 'chai'
import { WarningSystem } from '../src'
import { Logger } from '../src'

class TestLogger extends Logger {
  public events: Array<{ type: 'info' | 'warn' | 'error'; value: string }> = []
  async terminal(type: 'info' | 'warn' | 'error', value: string) {
    this.events.push({ type, value })
  }
}

describe('WarningSystem', () => {
  it('deduplicates duplicate-file errors', async () => {
    const logger = new TestLogger(undefined, false)
    const warnings = new WarningSystem(logger, { verbose: true })

    await warnings.emitDuplicateFileError({
      packageName: '@openzeppelin/contracts',
      relativePath: 'access/Ownable.sol',
      previousVersion: '4.9.6',
      requestedVersion: '5.0.0'
    })
    await warnings.emitDuplicateFileError({
      packageName: '@openzeppelin/contracts',
      relativePath: 'access/Ownable.sol',
      previousVersion: '4.9.6',
      requestedVersion: '5.0.0'
    })

    expect(logger.events.length).to.equal(1)
    expect(logger.events[0].type).to.equal('error')
    expect(logger.events[0].value).to.contain('DUPLICATE FILE DETECTED')
  })

  it('deduplicates multi-parent conflict warnings', async () => {
    const logger = new TestLogger(undefined, false)
    const warnings = new WarningSystem(logger, { verbose: true })

    await warnings.emitMultiParentConflictWarn('@openzeppelin/contracts', [
      { parent: '@parent/a@1.0.0', version: '4.9.6' },
      { parent: '@parent/b@1.0.0', version: '5.0.0' }
    ])
    await warnings.emitMultiParentConflictWarn('@openzeppelin/contracts', [
      { parent: '@parent/a@1.0.0', version: '4.9.6' },
      { parent: '@parent/b@1.0.0', version: '5.0.0' }
    ])

    expect(logger.events.length).to.equal(1)
    expect(logger.events[0].type).to.equal('warn')
    expect(logger.events[0].value).to.contain('MULTI-PARENT DEPENDENCY CONFLICT')
  })

  it('gates noisy warnings behind verbose mode', async () => {
    const logger = new TestLogger(undefined, false)
    const quiet = new WarningSystem(logger, { verbose: false })

    await quiet.emitFailedToResolve('some/thing.sol')
    await quiet.emitInvalidSolidityImport('some/thing.txt')

    expect(logger.events.length).to.equal(0)

    const loud = new WarningSystem(logger, { verbose: true })
    await loud.emitFailedToResolve('some/thing.sol')
    await loud.emitInvalidSolidityImport('some/thing.txt')

    // Only two new events from the loud warnings
    expect(logger.events.length).to.equal(2)
    expect(logger.events[0].type).to.equal('warn')
    expect(logger.events[1].type).to.equal('warn')
  })
})
