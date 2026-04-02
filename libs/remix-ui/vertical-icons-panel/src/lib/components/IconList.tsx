/* eslint-disable no-use-before-define */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect } from 'react'
import { Plugin } from '@remixproject/engine'
import { IconRecord } from '../types'
import Icon from './Icon'
interface OtherIconsProps {
  verticalIconsPlugin: Plugin<any, any>
  itemContextAction: (e: any, name: string, documentation: string) => Promise<void>
  icons: IconRecord[]
  theme: string
}

function IconList({ verticalIconsPlugin, itemContextAction, icons, theme }: OtherIconsProps) {
  return (
    <div id="otherIcons" className="relative">
      {icons.map((p) => (
        <Icon theme={theme} iconRecord={p} verticalIconPlugin={verticalIconsPlugin} contextMenuAction={itemContextAction} key={p.profile.name} />
      ))}
    </div>
  )
}

export default IconList
