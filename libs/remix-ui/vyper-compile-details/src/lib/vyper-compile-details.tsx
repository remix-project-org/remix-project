/* eslint-disable @nx/enforce-module-boundaries */
import React, { useState } from 'react'
import VyperCompile from './vyperCompile'
import { ThemeKeys, ThemeObject } from '@microlink/react-json-view'
import { GitHubCallback } from 'libs/remix-ui/top-bar/src/topbarUtils/gitOauthHandler'
import { GitHubUser } from 'libs/remix-api/src/lib/types/git'
import { GitHubLogin } from 'libs/remix-ui/top-bar/src/components/gitLogin'

interface RemixUiVyperCompileDetailsProps {
  payload: any
  theme?: ThemeKeys | ThemeObject
  themeStyle?: any
}

export function RemixUiVyperCompileDetails({ payload, theme, themeStyle }: RemixUiVyperCompileDetailsProps) {
  const compileResult = payload['compileResult'] ?? {}
  const bcode = compileResult.bytecode ? compileResult.bytecode.object : ''
  const runtimeBcode = compileResult.runtimeBytecode ? compileResult.runtimeBytecode.object : ''
  const ir = compileResult.ir
  const methodIdentifiers = compileResult.methodIdentifiers
  const abi = compileResult.abi
  const compilerVersion = compileResult?.version ?? ''
  const emvVersion = compileResult?.evmVersion ?? ''

  return (
    <>
      <VyperCompile result={{ bytecode: bcode, bytecodeRuntime: runtimeBcode, ir: ir, methodIdentifiers: methodIdentifiers, abi: abi, compilerVersion: compilerVersion, evmVersion: emvVersion }} theme={theme} themeStyle={themeStyle} />
    </>
  )
}
