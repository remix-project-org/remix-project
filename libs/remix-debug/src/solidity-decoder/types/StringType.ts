'use strict'
import { DynamicByteArray } from './DynamicByteArray'

export class StringType extends DynamicByteArray {

  constructor (location) {
    super(location)
    this.typeName = 'string'
  }

  async decodeFromStorage (location, storageResolver) {
    let decoded: any = '0x'
    try {
      decoded = await super.decodeFromStorage(location, storageResolver)
    } catch (e) {
      console.log(e)
      return { error: '<decoding failed - ' + e.message + '>' }
    }
    return format(decoded)
  }

  async decodeFromStack (stackIndex, stack, memory, storageResolver, calldata, cursor, variableDetails?) {
    try {
      return await super.decodeFromStack(stackIndex, stack, memory, storageResolver, calldata, cursor, variableDetails)
    } catch (e) {
      console.log(e)
      return { error: '<decoding failed - ' + e.message + '>', type: this.typeName }
    }
  }

  decodeFromMemoryInternal (offset, memory) {
    const decoded = super.decodeFromMemoryInternal(offset, memory)
    return format(decoded)
  }
}

function format (decoded) {
  if (decoded.error) {
    return decoded
  }
  let value = decoded.value
  value = value.replace('0x', '').replace(/(..)/g, '%$1')
  const ret = { length: decoded.length, raw: decoded.value, type: 'string' }
  try {
    ret['value'] = decodeURIComponent(value)
  } catch (e) {
    ret['error'] = 'Invalid UTF8 encoding'
    ret.raw = decoded.value
  }
  return ret
}
