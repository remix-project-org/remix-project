'use strict'

import { Address as AddressType } from './types/Address'
import { ArrayType } from './types/ArrayType'
import { Bool as BoolType } from './types/Bool'
import { DynamicByteArray as BytesType } from './types/DynamicByteArray'
import { FixedByteArray as BytesXType } from './types/FixedByteArray'
import { Enum as EnumType } from './types/Enum'
import { StringType } from './types/StringType'
import { Struct as StructType } from './types/Struct'
import { Int as IntType } from './types/Int'
import { Uint as UintType } from './types/Uint'
import { Mapping as MappingType } from './types/Mapping'
import { FunctionType } from './types/FunctionType'
import { extractLocation, removeLocation } from './types/util'

/**
  * mapping decode the given @arg type
  *
  * @param {String} type - type given by the AST
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function mapping (type, stateDefinitions, contractName) {
  const match = type.match(/mapping\((.*?)=>(.*)\)$/)
  const keyTypeName = match[1].trim()
  const valueTypeName = match[2].trim()

  const keyType = parseType(keyTypeName, stateDefinitions, contractName, 'storage')
  const valueType = parseType(valueTypeName, stateDefinitions, contractName, 'storage')

  const underlyingTypes = {
    keyType: keyType,
    valueType: valueType
  }
  return new MappingType(underlyingTypes, 'location', removeLocation(type))
}

/**
  * Uint decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g uint256, uint32)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function uint (type) {
  type = type === 'uint' ? 'uint256' : type
  const storageBytes = parseInt(type.replace('uint', '')) / 8
  return new UintType(storageBytes)
}

/**
  * Int decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g int256, int32)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function int (type) {
  type = type === 'int' ? 'int256' : type
  const storageBytes = parseInt(type.replace('int', '')) / 8
  return new IntType(storageBytes)
}

/**
  * Address decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g address)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function address (type) {
  return new AddressType()
}

/**
  * Bool decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g bool)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function bool (type) {
  return new BoolType()
}

function functionType (type, stateDefinitions, contractName, location) {
  return new FunctionType(type, stateDefinitions, contractName, location)
}

/**
  * DynamicByteArray decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g bytes storage ref)
  * @param {null} stateDefinitions - all state definitions given by the AST (including struct and enum type declaration) for all contracts
  * @param {null} contractName - contract the @args typeName belongs to
  * @param {String} location - location of the data (storage ref| storage pointer| memory| calldata)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function dynamicByteArray (type, stateDefinitions, contractName, location) {
  if (!location) {
    location = extractLocation(type)
  }
  if (location) {
    return new BytesType(location)
  } else {
    return null
  }
}

/**
  * FixedByteArray decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g bytes16)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function fixedByteArray (type) {
  const storageBytes = parseInt(type.replace('bytes', ''))
  return new BytesXType(storageBytes)
}

/**
  * StringType decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g string storage ref)
  * @param {null} stateDefinitions - all state definitions given by the AST (including struct and enum type declaration) for all contracts
  * @param {null} contractName - contract the @args typeName belongs to
  * @param {String} location - location of the data (storage ref| storage pointer| memory| calldata)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function stringType (type, stateDefinitions, contractName, location) {
  if (!location) {
    location = extractLocation(type)
  }
  if (location) {
    return new StringType(location)
  } else {
    return null
  }
}

/**
  * ArrayType decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g int256[] storage ref, int256[] storage ref[] storage ref)
  * @param {Object} stateDefinitions - all state definitions given by the AST (including struct and enum type declaration) for all contracts
  * @param {String} contractName - contract the @args typeName belongs to
  * @param {String} location - location of the data (storage ref| storage pointer| memory| calldata)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName, arraySize, subArray}
  */
function array (type, stateDefinitions, contractName, location) {
  const match = type.match(/(.*)\[(.*?)\]( storage ref| storage pointer| memory| calldata)?$/)
  if (!match) {
    console.log('unable to parse type ' + type)
    return null
  }
  if (!location) {
    location = match[3].trim()
  }
  const arraySize = match[2] === '' ? 'dynamic' : parseInt(match[2])
  const underlyingType = parseType(match[1], stateDefinitions, contractName, location)
  if (underlyingType === null) {
    console.log('unable to parse type ' + type)
    return null
  }
  return new ArrayType(underlyingType, arraySize, location)
}

/**
  * Enum decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g enum enumDef)
  * @param {Object} stateDefinitions - all state definitions given by the AST (including struct and enum type declaration) for all contracts
  * @param {String} contractName - contract the @args typeName belongs to
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName, enum}
  */
function enumType (type, stateDefinitions, contractName) {
  const match = type.match(/enum (.*)/)
  const enumDef = getEnum(match[1], stateDefinitions, contractName)
  if (enumDef === null) {
    console.log('unable to retrieve decode info of ' + type)
    return null
  }
  return new EnumType(enumDef)
}

/**
  * Struct decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g struct structDef storage ref)
  * @param {Object} stateDefinitions - all state definitions given by the AST (including struct and enum type declaration) for all contracts
  * @param {String} contractName - contract the @args typeName belongs to
  * @param {String} location - location of the data (storage ref| storage pointer| memory| calldata)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName, members}
  */
function struct (type, stateDefinitions, contractName, location) {
  const match = type.match(/struct (\S*?)( storage ref| storage pointer| memory| calldata)?$/)
  if (match) {
    if (!location) {
      location = match[2].trim()
    }
    const memberDetails = getStructMembers(match[1], stateDefinitions, contractName, location) // type is used to extract the ast struct definition
    if (!memberDetails) return null
    return new StructType(memberDetails, location, match[1])
  } else {
    return null
  }
}

/**
  * retrieve enum declaration of the given @arg type
  *
  * @param {String} type - type given by the AST (e.g enum enumDef)
  * @param {Object} stateDefinitions  - all state declarations given by the AST (including struct and enum type declaration) for all contracts
  * @param {String} contractName - contract the @args typeName belongs to
  * @return {Array} - containing all value declaration of the current enum type
  */
function getEnum (type, stateDefinitions, contractName) {
  const split = type.split('.')
  if (!split.length) {
    type = contractName + '.' + type
  } else {
    contractName = split[0]
  }
  const state = stateDefinitions[contractName]
  if (state) {
    for (const dec of state.stateDefinitions) {
      if (dec && dec.name && type === contractName + '.' + dec.name) {
        return dec
      }
    }
  }
  return null
}

/**
  * retrieve members declared in the given @arg type
  *
  * @param {String} typeName - name of the struct type (e.g struct <name>)
  * @param {Object} stateDefinitions  - all state definition given by the AST (including struct and enum type declaration) for all contracts
  * @param {String} contractName - contract the @args typeName belongs to
  * @param {String} location - location of the data (storage ref| storage pointer| memory| calldata)
  * @return {Array} containing all members of the current struct type
  */
function getStructMembers (type, stateDefinitions, contractName, location) {
  if (type.indexOf('.') === -1) {
    type = contractName + '.' + type
  }
  contractName = type.split('.')[0]
  const state = stateDefinitions[contractName]
  if (state) {
    for (const dec of state.stateDefinitions) {
      if (dec.nodeType === 'StructDefinition' && type === contractName + '.' + dec.name) {
        const offsets = computeOffsets(dec.members, stateDefinitions, contractName, location)
        if (!offsets) {
          return null
        }
        return {
          members: offsets.typesOffsets,
          storageSlots: offsets.endLocation.slot
        }
      }
    }
  }
  return null
}

/**
  * parse the full type
  *
  * @param {String} fullType - type given by the AST (ex: uint[2] storage ref[2])
  * @return {String} returns the token type (used to instantiate the right decoder) (uint[2] storage ref[2] will return 'array', uint256 will return uintX)
  */
function typeClass (fullType) {
  fullType = removeLocation(fullType)
  if (fullType.lastIndexOf(']') === fullType.length - 1) {
    return 'array'
  }
  if (fullType.indexOf('mapping') === 0) {
    return 'mapping'
  }
  if (fullType.indexOf(' ') !== -1) {
    fullType = fullType.split(' ')[0]
  }
  const char = fullType.indexOf('bytes') === 0 ? 'X' : ''
  return fullType.replace(/[0-9]+/g, char)
}

/**
  * parse the type and return an object representing the type
  *
  * @param {Object} type - type name given by the ast node
  * @param {Object} stateDefinitions - all state stateDefinitions given by the AST (including struct and enum type declaration) for all contracts
  * @param {String} contractName - contract the @args typeName belongs to
  * @param {String} location - location of the data (storage ref| storage pointer| memory| calldata)
  * @return {Object} - return the corresponding decoder or null on error
  */
function parseType (type, stateDefinitions, contractName, location) {
  const decodeInfos = {
    contract: address,
    address: address,
    array: array,
    bool: bool,
    bytes: dynamicByteArray,
    bytesX: fixedByteArray,
    enum: enumType,
    string: stringType,
    struct: struct,
    int: int,
    uint: uint,
    mapping: mapping,
    function: functionType,
    ShortString: fixedByteArray
  }
  const currentType = typeClass(type)
  if (currentType === null) {
    console.log('unable to retrieve decode info of ' + type)
    return null
  }
  if (decodeInfos[currentType]) {
    return decodeInfos[currentType](type, stateDefinitions, contractName, location)
  } else {
    return null
  }
}

/**
  * compute offset (slot offset and byte offset of the @arg list of types)
  *
  * @param {Array} types - list of types
  * @param {Object} stateDefinitions - all state definitions given by the AST (including struct and enum type declaration) for all contracts
  * @param {String} contractName - contract the @args typeName belongs to
  * @param {String} location - location of the data (storage ref| storage pointer| memory| calldata)
  * @return {Array} - return an array of types item: {name, type, location}. location defines the byte offset and slot offset
  */
function computeOffsets (types, stateDefinitions, contractName, location) {
  const ret = []
  const storagelocation = {
    offset: 0,
    slot: 0
  }
  for (const i in types) {
    const variable = types[i]
    const type = parseType(variable.typeDescriptions.typeString, stateDefinitions, contractName, location)
    if (!type) {
      console.warn('[computeOffsets] Unable to retrieve decode info for variable "' + variable.name + '" of type "' + variable.typeDescriptions.typeString + '", skipping this variable')
      // Skip this variable instead of failing completely
      // This allows other state variables to be decoded even if some types are unsupported
      continue
    }
    const immutable = variable.mutability === 'immutable'
    const hasStorageSlots = !immutable && !variable.constant
    if (hasStorageSlots && storagelocation.offset + type.storageBytes > 32) {
      storagelocation.slot++
      storagelocation.offset = 0
    }
    ret.push({
      name: variable.name,
      type: type,
      constant: variable.constant,
      immutable,
      storagelocation: {
        offset: !hasStorageSlots ? 0 : storagelocation.offset,
        slot: !hasStorageSlots ? 0 : storagelocation.slot
      },
      variable
    })
    if (hasStorageSlots) {
      if (type.storageSlots === 1 && storagelocation.offset + type.storageBytes <= 32) {
        storagelocation.offset += type.storageBytes
      } else {
        storagelocation.slot += type.storageSlots
        storagelocation.offset = 0
      }
    }
  }
  if (storagelocation.offset > 0) {
    storagelocation.slot++
  }
  return {
    typesOffsets: ret,
    endLocation: storagelocation
  }
}

export {
  parseType,
  computeOffsets,
  uint as Uint,
  address as Address,
  bool as Bool,
  dynamicByteArray as DynamicByteArray,
  fixedByteArray as FixedByteArray,
  int as Int,
  stringType as String,
  array as Array,
  enumType as Enum,
  struct as Struct
}
