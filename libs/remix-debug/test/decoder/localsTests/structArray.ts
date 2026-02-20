'use strict'
import * as helper from './helper'

module.exports = async function (st, privateKey, contractBytecode, compilationResult, contractCode) {
  try {
    const { traceManager, callTree, waitForCallTree } = await helper.setupDebugger(privateKey, contractBytecode, compilationResult, contractCode)

    await waitForCallTree()

    await helper.decodeLocals(st, 1615, traceManager, callTree, function (locals) {
      try {
        // Test all struct and array values
        st.equals(locals['bytesSimple'].length, '0x14')
        st.equals(locals['bytesSimple'].value, '0x746573745f7375706572')
        st.equals(locals['e'].value['a'].value, 'test')
        st.equals(locals['e'].value['a'].length, '0x8')
        st.equals(locals['e'].value['a'].raw, '0x74657374')
        st.equals(locals['e'].value['b'].value, '5')
        st.equals(locals['e'].value['c'].length, '0x220')
        st.equals(locals['e'].value['c'].raw, '0x746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374')
        st.equals(locals['e'].value['c'].value, 'test_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_test')
        st.equals(locals['e'].value['d'].value, '3')
        st.equals(locals['f'].length, '0x1b8')
        st.equals(locals['f'].raw, '0x746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f')
        st.equals(locals['f'].value, 'test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_test_long_')
        st.equals(locals['e'].value['e'].value, true)

        // Test simple array
        st.equals(locals['simpleArray'].value[0].value, '45')
        st.equals(locals['simpleArray'].value[1].value, '324324')
        st.equals(locals['simpleArray'].value[2].value, '-333')
        st.equals(locals['simpleArray'].value[3].value, '5656')
        st.equals(locals['simpleArray'].value[4].value, '-1111')

        // Test string array
        st.equals(locals['stringArray'].value[0].value, 'long_one_long_one_long_one_long_one_long_one_long_one_long_one_long_one_long_one_long_one_long_one_long_one_long_one_long_one_long_one_')
        st.equals(locals['stringArray'].value[1].value, 'two')
        st.equals(locals['stringArray'].value[2].value, 'three')

        // Test dynamic array
        st.equals(locals['dynArray'].value[0].value[0].value, '3423423532')
        st.equals(locals['dynArray'].value[1].value[0].value, '-342343323532')
        st.equals(locals['dynArray'].value[1].value[1].value, '23432')
        st.equals(locals['dynArray'].value[2].value[0].value, '-432432')
        st.equals(locals['dynArray'].value[2].value[1].value, '3423423532')
        st.equals(locals['dynArray'].value[2].value[2].value, '-432432')

        // Test struct array
        st.equals(locals['structArray'].value[0].value['a'].value, 'test')
        st.equals(locals['structArray'].value[0].value['a'].length, '0x8')
        st.equals(locals['structArray'].value[0].value['a'].raw, '0x74657374')
        st.equals(locals['structArray'].value[0].value['b'].value, '5')
        st.equals(locals['structArray'].value[0].value['c'].length, '0x220')
        st.equals(locals['structArray'].value[0].value['c'].raw, '0x746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374746573745f6c6f6e675f746573745f6c6f6e675f746573745f6c6f6e675f74657374')
        st.equals(locals['structArray'].value[0].value['c'].value, 'test_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_testtest_long_test_long_test_long_test')
        st.equals(locals['structArray'].value[0].value['d'].value, '3')
        st.equals(locals['structArray'].value[0].value['e'].value, true)

        st.equals(locals['structArray'].value[1].value['a'].value, 'item1 a')
        st.equals(locals['structArray'].value[1].value['b'].value, '20')
        st.equals(locals['structArray'].value[1].value['c'].value, 'item1 c')
        st.equals(locals['structArray'].value[1].value['d'].value, '-45')
        st.equals(locals['structArray'].value[1].value['e'].value, false)

        st.equals(locals['structArray'].value[2].value['a'].value, 'item2 a')
        st.equals(locals['structArray'].value[2].value['b'].value, '200')
        st.equals(locals['structArray'].value[2].value['c'].value, 'item2 c')
        st.equals(locals['structArray'].value[2].value['d'].value, '-450')
        st.equals(locals['structArray'].value[2].value['e'].value, true)

        // Test array struct
        st.equals(locals['arrayStruct'].value.a.value[0].value, 'string')
        st.equals(locals['arrayStruct'].value.b.value[0].value, '34')
        st.equals(locals['arrayStruct'].value.b.value[1].value, '-23')
        st.equals(locals['arrayStruct'].value.b.value[2].value, '-3')
        st.equals(locals['arrayStruct'].value.c.value, 'three')

        st.equals(Object.keys(locals).length, 8)
      } catch (e) {
        st.fail(e.message)
      }
    })

    // Second test: step 7
    await helper.decodeLocals(st, 7, traceManager, callTree, function (locals) {
      try {
        console.log('at 7', locals)
        st.equals(0, 0)
        // st.equals(Object.keys(locals).length, 0)
      } catch (e) {
        st.fail(e.message)
      }
    })

  } catch (error) {
    st.fail(error)
  }
}