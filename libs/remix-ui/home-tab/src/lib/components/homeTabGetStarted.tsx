/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useRef, useContext, SyntheticEvent, useState } from 'react'
import { useIntl, FormattedMessage } from 'react-intl'
import { TEMPLATE_NAMES, TEMPLATE_METADATA } from '@remix-ui/workspace'
import { ThemeContext } from '../themeContext'
import WorkspaceTemplate from './workspaceTemplate'
import 'react-multi-carousel/lib/styles.css'
import { AppContext, appPlatformTypes, platformContext } from '@remix-ui/app'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { Plugin } from "@remixproject/engine";
import { CustomRemixApi } from '@remix-api'
import { CustomTooltip } from '@remix-ui/helper'

interface HomeTabGetStartedProps {
  plugin: any
}

type WorkspaceTemplate = {
  gsID: string
  workspaceTitle: string
  description: string
  projectLogo: string
  templateName: string
}

const workspaceTemplates: WorkspaceTemplate[] = [
  {
    gsID: 'sUTLogo',
    workspaceTitle: 'Start Coding',
    description: 'Start coding using the default template.',
    projectLogo: 'assets/img/remixverticaltextLogo.png',
    templateName: 'remixDefault',
  },
  {
    gsID: 'sUTLogo',
    workspaceTitle: 'ZK Semaphore',
    description: 'Create a new ZK Project with Circom using this template.',
    projectLogo: 'assets/img/circom.webp',
    templateName: 'semaphore',
  },
  {
    gsID: 'sUTLogo',
    workspaceTitle: 'ERC20',
    description: 'Create a new ERC20 token using this template.',
    projectLogo: 'assets/img/oxprojectLogo.png',
    templateName: 'ozerc20',
  },
  {
    gsID: 'sUTLogo',
    workspaceTitle: 'Uniswap V4 Hooks',
    description: 'Create a new workspace based on this template.',
    projectLogo: 'assets/img/gnosissafeLogo.png',
    templateName: 'uniswapV4Template',
  },
  {
    gsID: 'sUTLogo',
    workspaceTitle: 'NFT / ERC721',
    description: 'Create a new ERC721 token using this template.',
    projectLogo: 'assets/img/openzeppelinLogo.png',
    templateName: 'ozerc721',
  },
  {
    gsID: 'sUTLogo',
    workspaceTitle: 'MultiSig',
    description: 'Create a new MultiSig wallet using this template.',
    projectLogo: 'assets/img/gnosissafeLogo.png',
    templateName: 'gnosisSafeMultisig',
  }
]

function HomeTabGetStarted({ plugin }: HomeTabGetStartedProps) {
  const platform = useContext(platformContext)
  const themeFilter = useContext(ThemeContext)
  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  // Component-specific tracker with default type, but allows overrides
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const intl = useIntl()
  const carouselRef = useRef<any>({})
  const carouselRefDiv = useRef(null)

  useEffect(() => {
    document.addEventListener('wheel', handleScroll)
    return () => {
      document.removeEventListener('wheel', handleScroll)
    }
  }, [])

  function isDescendant(parent, child) {
    let node = child.parentNode
    while (node != null) {
      if (node === parent) {
        return true
      }
      node = node.parentNode
    }
    return false
  }

  const handleScroll = (e) => {
    if (isDescendant(carouselRefDiv.current, e.target)) {
      e.stopPropagation()
      let nextSlide = 0
      if (e.wheelDelta < 0) {
        nextSlide = carouselRef.current.state.currentSlide + 1
        if (Math.abs(carouselRef.current.state.transform) >= carouselRef.current.containerRef.current.scrollWidth - carouselRef.current.state.containerWidth) return
        carouselRef.current.goToSlide(nextSlide)
      } else {
        nextSlide = carouselRef.current.state.currentSlide - 1
        if (nextSlide < 0) nextSlide = 0
        carouselRef.current.goToSlide(nextSlide)
      }
    }
  }

  const createWorkspace = async (templateName) => {
    if (platform === appPlatformTypes.desktop) {
      await plugin.call('remix-templates', 'loadTemplateInNewWindow', templateName)
      return
    }

    let templateDisplayName = TEMPLATE_NAMES[templateName]
    const metadata = TEMPLATE_METADATA[templateName]

    if (metadata) {
      if (metadata.type === 'git') {
        await (plugin as Plugin<any, CustomRemixApi>).call('dgitApi', 'clone',
          {
            url: metadata.url,
            branch: metadata.branch,
            workspaceName: templateDisplayName,
            depth: 10
          })
      } else if (metadata && metadata.type === 'plugin') {
        await plugin.appManager.activatePlugin('filePanel')
        templateDisplayName = await plugin.call('filePanel', 'getAvailableWorkspaceName', templateDisplayName)
        await plugin.call('filePanel', 'createWorkspace', templateDisplayName, 'blank')
        await plugin.call('filePanel', 'setWorkspace', templateDisplayName)
        plugin.verticalIcons.select('filePanel')
        await plugin.call(metadata.name, metadata.endpoint, ...metadata.params)
      }
    } else {
      await plugin.appManager.activatePlugin('filePanel')
      templateDisplayName = await plugin.call('filePanel', 'getAvailableWorkspaceName', templateDisplayName)
      await plugin.call('filePanel', 'createWorkspace', templateDisplayName, templateName)
      await plugin.call('filePanel', 'setWorkspace', templateDisplayName)
      plugin.verticalIcons.select('filePanel')
    }
    trackMatomoEvent({
      category: 'hometab',
      action: 'homeGetStarted',
      name: templateName,
      isClick: true
    })
  }

  return (
    <div className="ps-2" id="hTGetStartedSection">
      <label className="pt-3" style={{ fontSize: '1.2rem' }}>
        <FormattedMessage id="home.projectTemplates" />
      </label>
      <div ref={carouselRefDiv} className="w-100 d-flex flex-column pt-1">
        <ThemeContext.Provider value={themeFilter}>
          <div className="pt-3">
            <div className="d-flex flex-row align-items-center flex-wrap">
              {workspaceTemplates.map((template, index) => (
                <CustomTooltip
                  tooltipText={template.description}
                  tooltipId={template.gsID}
                  tooltipClasses="text-nowrap"
                  tooltipTextClasses="border bg-light text-dark p-1 pe-3"
                  placement="top-start"
                  key={`${template.gsID}-${template.workspaceTitle}-${index}`}
                >
                  <button
                    key={index}
                    className={index === 0 ?
                      'btn btn-primary border p-2 text-nowrap me-3 mb-3' :
                      index === workspaceTemplates.length - 1 ?
                        'btn border p-2 text-nowrap me-2 mb-3' :
                        'btn border p-2 text-nowrap me-3 mb-3'
                    }
                    onClick={async (e) => {
                      createWorkspace(template.templateName)
                    }}
                    data-id={`homeTabGetStarted${template.templateName}`}
                  >
                    {template.workspaceTitle}
                  </button>
                </CustomTooltip>
              ))}
            </div>
          </div>
        </ThemeContext.Provider>
      </div>
    </div>
  )
}

export default HomeTabGetStarted
