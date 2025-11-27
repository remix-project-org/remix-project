// eslint-disable-next-line no-use-before-define
import React, { useEffect, useState } from 'react'
import { environmentExplorerUIGridSections, environmentExplorerUIProps } from '../types'
import { RemixUIGridCell, RemixUIGridSection, RemixUIGridView } from '@remix-ui/remix-ui-grid-view'
import { CustomTooltip } from '@remix-ui/helper'

const defaultSections: environmentExplorerUIGridSections = {
  Injected: {
    title: 'Deploy using a Browser Extension.',
    keywords: ['Injected'],
    providers: [],
    filterFn: (provider) => provider.config.isInjected
  },
  'Remix VMs': {
    title: 'Deploy to an In-browser Virtual Machine.',
    keywords: ['Remix VMs'],
    providers: [],
    filterFn: (provider) => provider.config.isVM && !provider.config.isVMStateForked && !provider.config.isRpcForkedState
  },
  'Forked States': {
    title: 'Deploy to an In-browser Forked State.',
    keywords: ['Forked State'],
    providers: [],
    filterFn: (provider) => provider.config.isVMStateForked || provider.config.isRpcForkedState,
    descriptionFn: (provider) => {
      if (provider.config.baseBlockNumber) {
        const { latestBlock, timestamp } = JSON.parse(provider.description)
        return (
          <>
            <div><b>Latest Block: </b>{provider.config.baseBlockNumber && provider.config.baseBlockNumber !== '0x0' ? parseInt(provider.config.baseBlockNumber) + parseInt(latestBlock) : parseInt(latestBlock)}</div>
            <CustomTooltip
              placement="auto"
              tooltipId="overlay-tooltip-forkedAt"
              tooltipText={`Forked on: ${(new Date(timestamp)).toLocaleString()}`}
            >
              <div>
                {
                  provider.config.baseBlockNumber && provider.config.baseBlockNumber !== '0x0' && <div><b>Origin Block: </b>{parseInt(provider.config.baseBlockNumber)}</div>
                }
                <b>Forked on: </b>{(new Date(timestamp)).toDateString()}
              </div>
            </CustomTooltip>
          </>)
      } else {
        // At this point we don't have any state in the browser, we start from the latest block
        return (
          <>
            <div>{provider.description}</div>
          </>)
      }
    }
  },
  'Externals': {
    title: 'Deploy to an external Provider.',
    keywords: ['Externals'],
    providers: [],
    filterFn: (provider) => (!provider.config.isInjected && !provider.config.isVM && !provider.config.isRpcForkedState && !provider.config.isVMStateForked)
  },
}
export const EnvironmentExplorerUI = (props: environmentExplorerUIProps) => {

  const [sections, setSections] = useState(defaultSections)
  const { state, pinStateCallback, profile } = props

  useEffect(() => {

    setSections((prevSections) => {
      const newSections = { ...prevSections }
      Object.keys(newSections).forEach((section) => {
        newSections[section].providers = Object.values(state.providersFlat).filter(newSections[section].filterFn)
        newSections[section].id = section
      })
      return newSections
    })
  }, [state])

  return (
    <>
      <RemixUIGridView
        plugin={null}
        styleList={""}
        logo={profile.icon}
        enableFilter={true}
        showUntagged={true}
        showPin={true}
        title={profile.description}
        description="Select the providers and chains to include them in the ENVIRONMENT select box of the Deploy & Run Transactions plugin."
      >
        {Object.values(sections).map((section) => (
          section.providers.length > 0 && (
            <RemixUIGridSection
              plugin={this}
              title={section.title}
              hScrollable={false}
              key={section.title}
            >
              {section.providers.map(provider => (
                <RemixUIGridCell
                  // plugin={this}
                  title={provider.displayName}
                  logos={provider.logos}
                  classList='EECellStyle'
                  searchKeywords={['Injected', provider.name, provider.displayName, provider.title, provider.description]}
                  pinned={state.pinnedProviders.includes(provider.name)}
                  key={provider.name}
                  id={provider.name}
                  pinStateCallback={async (pinned: boolean) => {
                    await pinStateCallback(provider, pinned)
                  }}
                >
                  <div data-id={`${provider.name}desc`}>{(section.descriptionFn && section.descriptionFn(provider)) || provider.description}</div>
                  { provider.config.isVMStateForked && provider.config.statePath && <CustomTooltip
                    placement="auto"
                    tooltipId={`overlay-tooltip-${provider.name}`}
                    tooltipText="Delete Environment Immediately"
                  >
                    <span
                      onClick={async () => props.deleteForkedState(provider)}
                      className="btn btn-sm mt-1 border border-danger"
                    >
                          Delete Environment
                    </span>
                  </CustomTooltip>
                  }
                  { false && provider.config.isVMStateForked && provider.config.statePath && <CustomTooltip
                    placement="auto"
                    tooltipId={`overlay-tooltip-${provider.name}`}
                    tooltipText="Show Pinned Contracts in the terminal"
                  >
                    <span
                      onClick={async () => props.showPinnedContracts(provider)}
                      className="btn btn-sm mt-1 border border-info"
                    >
                          Show Pinned Contracts
                    </span>
                  </CustomTooltip>
                  }
                </RemixUIGridCell>
              ))}
            </RemixUIGridSection>
          )
        ))}
      </RemixUIGridView>
    </>
  )
}
