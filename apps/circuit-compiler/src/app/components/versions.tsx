import { AppState } from "../types"
import React from "react"
import isElectron from 'is-electron'
import { Select } from "@remix-ui/helper"

export function VersionList ({ currentVersion, versionList, downloadList, setVersion }: { versionList: AppState['versionList'], currentVersion: string, setVersion: (version: string) => void , downloadList: string[]}) {
  const options = Object.keys(versionList).reverse().map((version) => ({
    value: version,
    label: isElectron() ? versionList[version].name.replace('wasm', '') : versionList[version].name,
    end: isElectron() ? downloadList.includes(version) ? <i className='far fa-arrow-circle-down'></i> : <i className='fas fa-arrow-circle-down text-success'></i> : undefined
  }))

  return (
    <Select
      id="circomVersionList"
      value={currentVersion}
      options={options}
      onChange={setVersion}
      renderValue={() => versionList[currentVersion].name}
    />
  )
}
