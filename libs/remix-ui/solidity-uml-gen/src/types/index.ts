import { ViewPlugin } from '@remixproject/engine-web'
import { customAction } from '@remixproject/plugin-api'
import type { CompilerInput } from '@remix-project/remix-solidity'
import React from 'react'

export interface ISolidityUmlGen extends ViewPlugin {
    element: HTMLDivElement
    currentFile: string
    svgPayload: string
    updatedSvg: string
    currentlySelectedTheme: string
    themeName: string
    themeDark: string
    loading: boolean
    themeCollection: ThemeSummary[]
    activeTheme: ThemeSummary
    renderError: boolean
    updateComponent(state: any): JSX.Element
    setDispatch(dispatch: React.Dispatch<any>): void
    generateCustomAction(action: customAction): Promise<void>
    flattenContract (source: any, filePath: string, data: any, input: CompilerInput): Promise<string>
    hideSpinner(): void
    renderComponent (): void
    triggerGenerateUml: boolean
    render(): JSX.Element
}

export type ThemeQualityType = { name: string, quality: 'light' | 'dark', url: string }

export type ThemeSummary = { name: string, quality: 'light' | 'dark', url: string, backgroundColor: string, textColor?: string,
shapeColor?: string, fillColor?: string }
