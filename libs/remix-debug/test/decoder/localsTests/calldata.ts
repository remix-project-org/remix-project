'use strict'
import * as helper from './helper'

module.exports = async function (st, privateKey, contractBytecode, compilationResult, contractCode) {
  try {
    const txData = 'a372a595000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001520000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000015400000000000000000000000000000000000000000000000000000000000000'

    const { traceManager, callTree, waitForCallTree } = await helper.setupDebugger(privateKey, contractBytecode, compilationResult, contractCode, txData)

    await waitForCallTree()

    await helper.decodeLocals(st, 140, traceManager, callTree, function (locals) {
      try {
        const expected = {
          "p": { "value": "45", "type": "uint256" },
          "foo": { "length": "1", "value": [{ "value": "3", "type": "uint8" }], "type": "uint8[1]" },
          "boo": { "length": "1", "value": [{ "length": "2", "value": [{ "value": "R", "type": "string" }, { "value": "T", "type": "string" }], "type": "string[2]" }], "type": "string[2][1]" }
        }
        st.deepEqual(locals, expected)
      } catch (e) {
        st.fail(e.message)
      }
    })

  } catch (error) {
    st.fail(error)
  }
}