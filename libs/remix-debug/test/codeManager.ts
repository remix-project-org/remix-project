'use strict'
import tape from 'tape'
import { TraceManager } from '../src/trace/traceManager'
import { CodeManager } from '../src/code/codeManager'
const web3Test = require('./resources/testWeb3.ts')

tape('CodeManager', function (t) {
  const traceManager = new TraceManager({ web3: web3Test })
  const codeManager = new CodeManager(traceManager)
  const contractCode = web3Test.getCode('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5')
  codeManager.codeResolver.cacheExecutingCode('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', contractCode) // so a call to web3 is not necessary
  const tx = web3Test.getTransaction('0x20ef65b8b186ca942fcccd634f37074dde49b541c27994fc7596740ef44cfd51')
  traceManager.resolveTrace(tx).then(() => {
    continueTesting(t, codeManager)
  }).catch(() => {
    t.fail(' - traceManager.resolveTrace - failed ')
  })
})

function continueTesting (t, codeManager) {
  t.test('CodeManager.init', function (st) {
    st.end()
  })

  t.test('CodeManager.resolveStep', function (st) {
    st.plan(6)
    codeManager.event.register('changed', this, function (code, address, index) {
      if (index === undefined || index === null) {
        st.fail(index)
      } else {
        st.ok(index === 6 || index === 0)
      }
    })

    codeManager.event.register('changed', this, function (code, address, index) {
      if (!code) {
        st.fail('no codes')
      } else {
        st.ok(address === '0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5' || address === '(Contract Creation - Step 63)')
        if (address === '0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5') {
          console.log(address + ' ' + code[25])
          st.ok(code[25].indexOf('DUP') !== -1)
        } else if (address === '(Contract Creation - Step 63)') {
          console.log(address + ' ' + code[25])
          st.ok(code[25].indexOf('JUMPDEST') !== -1)
        }
      }
    })
    const tx = web3Test.getTransaction('0x20ef65b8b186ca942fcccd634f37074dde49b541c27994fc7596740ef44cfd51')
    codeManager.resolveStep(0, tx)
    codeManager.resolveStep(70, tx)
  })

  t.test('CodeManager.getInstructionIndex', function (st) {
    st.plan(2)
    try {
      const result = codeManager.getInstructionIndex('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', 16)
      console.log(result)
      st.ok(result === 25)
    } catch (error) {
      st.fail(error)
    }

    try {
      const result = codeManager.getInstructionIndex('(Contract Creation - Step 63)', 70)
      console.log(result)
      st.ok(result === 6)
    } catch (error) {
      st.fail(error)
    }
  })
}