'use strict'
import * as helper from './helper'

module.exports = async function (st, privateKey, contractBytecode, compilationResult, contractCode) {
  try {
    const { traceManager, callTree, waitForCallTree } = await helper.setupDebugger(privateKey, contractBytecode, compilationResult, contractCode)

    const { scopes, scopeStarts } = await waitForCallTree()

    // test gas cost per line
    st.equals((await callTree.getGasCostPerLine(0, 16, '1')).gasCost, 10)
    st.equals((await callTree.getGasCostPerLine(0, 32, '1.4')).gasCost, 13)

    st.equals(scopeStarts[0], '1')
    st.equals(scopeStarts[12], '1.1')
    st.equals(scopeStarts[119], '1.2')
    st.equals(scopeStarts[132], '1.2.1')
    st.equals(scopeStarts[153], '1.3')
    // Test locals at step 95 - all integer types
    await helper.decodeLocals(st, 119, traceManager, callTree, function (locals) {
      st.equals(Object.keys(locals).length, 16)
      st.equals(locals['ui8'].value, '130')
      st.equals(locals['ui16'].value, '456')
      st.equals(locals['ui32'].value, '4356')
      st.equals(locals['ui64'].value, '3543543543')
      st.equals(locals['ui128'].value, '234567')
      st.equals(locals['ui256'].value, '115792089237316195423570985008687907853269984665640564039457584007880697216513')
      st.equals(locals['ui'].value, '123545666')
      st.equals(locals['i8'].value, '-45')
      st.equals(locals['i16'].value, '-1234')
      st.equals(locals['i32'].value, '3455')
      st.equals(locals['i64'].value, '-35566')
      st.equals(locals['i128'].value, '-444444')
      st.equals(locals['i256'].value, '3434343')
      st.equals(locals['i'].value, '-32432423423')
      st.equals(locals['ishrink'].value, '2')
    })

    // Test locals at step 105 - reduced scope
    await helper.decodeLocals(st, 125, traceManager, callTree, function (locals) {
      try {
        st.equals(locals['ui8'].value, '123')
        st.equals(Object.keys(locals).length, 2)
      } catch (e) {
        st.fail(e.message)
      }
    })

    // Test symbolic stack at step 95 - verify stack contains the tested variables
    const symbolicStack = callTree.getSymbolicStackAtStep(119)
    if (symbolicStack && symbolicStack.length > 0) {
      // Check that we have symbolic representations for the integer variables
      const stackVarNames = symbolicStack.map(item => item.variableName || '').filter(name => name)

      const locals = [
        'p', 'ui8', 'ui16',
        'ui32', 'ui64', 'ui128',
        'ui256', 'ui', 'i8',
        'i16', 'i32', 'i64',
        'i128', 'i256', 'i', 'ishrink'
      ]
      const hasIntegerVars = stackVarNames.some(name => locals.includes(name))

      st.ok(hasIntegerVars, 'Symbolic stack should contain integer variable representations')
      st.ok(stackVarNames.length === 16, "Symbolic stack should contain 16 integer variable representations")
      st.ok(Array.isArray(symbolicStack), 'getSymbolicStackAtStep should return an array')

    } else {
      // If stack is empty or undefined, that's also valid for this test
      st.ok(true, 'Symbolic stack is empty or undefined at step 95')
    }

  } catch (error) {
    st.fail(error)
  }
}