import { appPlatformTypes, platformContext } from '@remix-ui/app'
import React, { useContext } from 'react'
import { useIntl } from 'react-intl'
import { Select, SelectOption } from '@remix-ui/helper'

export type compilerVersion = {
  path: string,
  longVersion: string,
  isDownloaded: boolean
}

interface compilerDropdownProps {
  customVersions: string[],
  selectedVersion: string,
  defaultVersion: string,
  allversions: compilerVersion[],
  handleLoadVersion: (url: string) => void,
  _shouldBeAdded: (version: string) => boolean,
  onlyDownloaded: boolean
  disabled: boolean
}

export const CompilerDropdown = (props: compilerDropdownProps) => {
  const platform = useContext(platformContext)
  const { customVersions, selectedVersion, defaultVersion, allversions, handleLoadVersion, _shouldBeAdded, onlyDownloaded } = props
  const intl = useIntl()
  // the newest release (the list is newest first, after "builtin")
  const latestPath = allversions.find((build) => build.path !== 'builtin' && !build.longVersion.includes('nightly'))?.path
  const latest = <span className="sc-muted ms-1">({intl.formatMessage({ id: 'solidity.latest' })})</span>
  const current = selectedVersion || defaultVersion

  // before the version list is loaded only the default and the built-in compiler are listed
  const options: SelectOption[] = allversions.length <= 0
    ? [
      { value: defaultVersion, label: defaultVersion, itemProps: { 'data-id': 'builtin' } },
      { value: 'builtin', label: 'builtin', itemProps: { 'data-id': 'builtin' } }
    ]
    : [
      ...customVersions.map((url) => ({ value: url, label: `custom: ${url}` })),
      ...allversions
        .filter((build) => !(onlyDownloaded && !build.isDownloaded) && _shouldBeAdded(build.longVersion))
        .map((build) => ({
          value: build.path,
          label: <>{build.longVersion}{build.path === latestPath && latest}</>,
          searchText: build.longVersion,
          end: platform == appPlatformTypes.desktop ? <i className={`${build.isDownloaded ? 'fas text-success' : 'far'} fa-arrow-circle-down`}></i> : undefined
        }))
    ]

  // the toggle also names a selected build that the filters hide from the list
  const renderValue = () => {
    if (customVersions.includes(current)) return <span data-id="selectedVersion">custom</span>
    const build = allversions.find((b) => b.path === current)
    return build && <span><span data-id="selectedVersion">{build.longVersion}</span>{build.path === latestPath && latest}</span>
  }

  return (
    <Select
      id="versionSelector"
      value={current}
      options={options}
      onChange={(path) => allversions.length > 0 && handleLoadVersion(path)}
      itemDataId={(o) => `dropdown-item-${o.value}`}
      renderValue={renderValue}
      disabled={props.disabled}
      searchable={allversions.length > 0}
      searchPlaceholder={intl.formatMessage({ id: 'solidity.searchVersions' })}
    />
  )
}
