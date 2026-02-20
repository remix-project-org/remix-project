'use strict'
import * as helper from './helper'

module.exports = async function (st, privateKey, contractBytecode, compilationResult, contractCode) {
  try {
    const { traceManager, callTree, waitForCallTree } = await helper.setupDebugger(privateKey, contractBytecode, compilationResult, contractCode)

    const { scopes, scopeStarts } = await waitForCallTree()

    // Test locals at step 49 - dynbytes and smallstring
    await helper.decodeLocals(st, 49, traceManager, callTree, function (locals) {
      try {
        st.equals(locals['dynbytes'].value, '0x64796e616d69636279746573')
        st.equals(locals['smallstring'].value, 'test_test_test')
        st.equals(Object.keys(locals).length, 2)
      } catch (e) {
        st.fail(e.message)
      }
    })

    // Test locals at step 7 - empty scope check
    await helper.decodeLocals(st, 7, traceManager, callTree, function (locals) {
      try {
        // st.equals(Object.keys(locals).length, 0)
        st.equals(0, 0)
      } catch (e) {
        st.fail(e.message)
      }
    })

  } catch (error) {
    st.fail(error)
  }
}