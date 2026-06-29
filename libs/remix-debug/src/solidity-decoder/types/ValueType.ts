'use strict'
import { extractHexValue } from './util'

export class ValueType {
  storageSlots
  storageBytes
  typeName
  basicType

  constructor (storageSlots, storageBytes, typeName) {
    this.storageSlots = storageSlots
    this.storageBytes = storageBytes
    this.typeName = typeName
    this.basicType = 'ValueType'
  }

  decodeValue (input? : any) {
    throw new Error('This method is abstract')
  }

  /**
    * decode the type with the @arg location from the storage
    *
    * @param {Object} location - containing offset and slot
    * @param {Object} storageResolver  - resolve storage queries
    * @return {Object} - decoded value
    */
  async decodeFromStorage (location, storageResolver) {
    try {
      const value = await extractHexValue(location, storageResolver, this.storageBytes)
      return { value: this.decodeValue(value), type: this.typeName }
    } catch (e) {
      console.log(e)
      return { error: '<decoding failed - ' + e.message + '>', type: this.typeName }
    }
  }

  /**
    * decode the type from the stack
    *
    * @param {Int} stackIndex - position of the type in the stack
    * @param {Array} stack - stack
    * @param {String} - memory
    * @return {Object} - decoded value
    */
  async decodeFromStack (stackIndex, stack, memory, storageResolver, calldata, cursor, variableDetails?) {
    let value
    if (stackIndex >= stack.length) {
      value = this.decodeValue('')
    } else {
      value = this.decodeValue(stack[stackIndex].replace('0x', ''))
    }
    return { value, type: this.typeName }
  }

  /**
    * decode the type with the @arg offset location from the memory
    *
    * @param {Int} stackIndex - position of the type in the stack
    * @return {String} - memory
    * @return {Object} - decoded value
    */
  decodeFromMemory (offset, memory) {
    const value = memory.substr(2 * offset, 64)
    return { value: this.decodeValue(value), type: this.typeName }
  }
}
