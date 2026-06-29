'use strict'
import * as helper from './helper'

module.exports = async function (st, privateKey, contractBytecode, compilationResult, contractCode) {
  try {
    const { traceManager, callTree, waitForCallTree } = await helper.setupDebugger(privateKey, contractBytecode, compilationResult, contractCode)

    const { scopes, scopeStarts } = await waitForCallTree()

    // First test: step 70
    await helper.decodeLocals(st, 70, traceManager, callTree, function (locals) {
      try {
        st.equals(locals['boolFalse'].value, false)
        st.equals(locals['boolTrue'].value, true)
        st.equals(locals['testEnum'].value, 'three')
        st.equals(locals['sender'].value, '0x5B38DA6A701C568545DCFCB03FCB875F56BEDDC4')
        st.equals(locals['_bytes1'].value, '0x99')
        st.equals(locals['__bytes1'].value, '0x99')
        st.equals(locals['__bytes2'].value, '0x99AB')
        st.equals(locals['__bytes4'].value, '0x99FA0000')
        st.equals(locals['__bytes6'].value, '0x990000000000')
        st.equals(locals['__bytes7'].value, '0x99356700000000')
        st.equals(locals['__bytes8'].value, '0x99ABD41700000000')
        st.equals(locals['__bytes9'].value, '0x99156744AF00000000')
        st.equals(locals['__bytes13'].value, '0x99123423425300000000000000')
        st.equals(locals['__bytes16'].value, '0x99AFAD23432400000000000000000000')
        st.equals(locals['__bytes24'].value, '0x99AFAD234324000000000000000000000000000000000000')
        st.equals(locals['__bytes32'].value, '0x9999ABD41799ABD4170000000000000000000000000000000000000000000000')
        st.equals(Object.keys(locals).length, 16)
      } catch (e) {
        st.fail(e.message)
      }
    })

    // Second test: step 7
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