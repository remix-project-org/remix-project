'use strict'
import { BN } from 'bn.js'
import { bytesToHex } from '@ethereumjs/util'

export function toInt (h) {
  if (h.indexOf && h.indexOf('0x') === 0) {
    return (new BN(h.replace('0x', ''), 16)).toString(10)
  } else if ((h.constructor && h.constructor.name === 'BigNumber') || BN.isBN(h) || (typeof h === 'bigint')) {
    return h.toString(10)
  }
  return h
}

export const stringify = convertToString

function convertToString (v) {
  try {
    if (v instanceof Array) {
      const ret = []
      for (const k in v) {
        ret.push(convertToString(v[k]))
      }
      return ret
    } else if (BN.isBN(v) || (v.constructor && v.constructor.name === 'BigNumber') || (typeof v === 'bigint')) {
      return v.toString(10)
    } else if (v._isBigNumber) {
      return toInt(v._hex)
    } else if (v._isBuffer) {
      return bytesToHex(v)
    } else if (typeof v === 'object') {
      const retObject = {}
      for (const i in v) {
        retObject[i] = convertToString(v[i])
      }
      return retObject
    } else {
      return v
    }
  } catch (e) {
    console.log(e)
    return v
  }
}
