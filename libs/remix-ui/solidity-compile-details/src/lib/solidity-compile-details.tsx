import { CopyToClipboard } from '@remix-ui/clipboard'
import { CustomTooltip } from '@remix-ui/helper'
import { TreeView, TreeViewItem } from '@remix-ui/tree-view'
import { ContractPropertyName } from '@remix-ui/solidity-compiler'

import React from 'react'
import SolidityCompile from './components/solidityCompile'

export interface RemixUiCompileDetailsProps {
  plugin?: any
  contractProperties?: any
  selectedContract?: string
  help?: any
  insertValue?: any
  saveAs: any
}

export function RemixUiCompileDetails({ plugin, contractProperties, selectedContract, saveAs, help, insertValue }: RemixUiCompileDetailsProps) {

  return (
    <>
      <SolidityCompile
        contractProperties={contractProperties}
        plugin={plugin}
        selectedContract={selectedContract}
        help={help}
        insertValue={insertValue}
        saveAs={saveAs}
      />
    </>
  )
}
