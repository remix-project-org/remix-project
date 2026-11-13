/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import { ViewPlugin } from '@remixproject/engine-web'
import React from 'react'
import { trackMatomoEvent } from '@remix-api'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { RemixUiSolidityUmlGen } from '@remix-ui/solidity-uml-gen'
import { ISolidityUmlGen, ThemeQualityType, ThemeSummary } from 'libs/remix-ui/solidity-uml-gen/src/types'
import { RemixAppManager } from 'libs/remix-ui/plugin-manager/src/types'
import { normalizeContractPath } from 'libs/remix-ui/solidity-compiler/src/lib/logic/flattenerUtilities'
import { convertAST2UmlClasses } from 'sol2uml/lib/converterAST2Classes'
import type { UmlClass } from 'sol2uml/lib/umlClass'
import { instance as vizInstance } from '@viz-js/viz'
import type { Viz } from '@viz-js/viz'
import { PluginViewWrapper } from '@remix-ui/helper'
import { customAction } from '@remixproject/plugin-api'
import type { CompilerInput } from '@remix-project/remix-solidity'
import { applyDisplayFont, convertUmlClasses2Dot, findMainClass, nameUnnamedFunctions, resolveUmlPalette } from './solidity-umlgen-dot'
const parser = (window as any).SolidityParser

let vizPromise: Promise<Viz> | undefined
const getViz = () => {
  if (!vizPromise) {
    vizPromise = vizInstance().catch((error) => {
      // Let a later diagram try loading Graphviz again
      vizPromise = undefined
      throw error
    })
  }
  return vizPromise
}

const profile = {
  name: 'solidityumlgen',
  displayName: 'Solidity UML Generator',
  description: 'Generates UML diagram in svg format from last compiled contract',
  location: 'mainPanel',
  methods: ['generateUml', 'generateCustomAction'],
  events: []
}

/**
 * add context menu which will offer download as pdf and download png.
 * add menu under the first download button to download
 */

export class SolidityUmlGen extends ViewPlugin implements ISolidityUmlGen {
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
  renderError = false
  triggerGenerateUml: boolean
  umlClasses: UmlClass[] = []
  mainClassId: number | undefined

  appManager: RemixAppManager
  dispatch: React.Dispatch<any> = () => {}
  constructor(appManager: RemixAppManager) {
    super(profile)
    this.currentFile = ''
    this.svgPayload = ''
    this.updatedSvg = ''
    this.loading = false
    this.currentlySelectedTheme = ''
    this.themeName = ''

    this.activeTheme = {} as ThemeSummary
    this.appManager = appManager
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'sol-uml-gen')
  }

  onActivation(): void {
    this.handleThemeChange()
    this.on('solidity', 'compilationFinished', async (file: string, source, languageVersion, data, input, version) => {
      if (!this.triggerGenerateUml) return
      this.triggerGenerateUml = false
      const currentTheme: ThemeQualityType = await this.call('theme', 'currentTheme')
      this.currentlySelectedTheme = currentTheme.quality
      this.themeName = currentTheme.name
      let result = ''
      const normalized = normalizeContractPath(file)
      this.currentFile = normalized[normalized.length - 1]
      try {
        if (data.sources && Object.keys(data.sources).length > 1) {
          // we should flatten first as there are multiple asts
          result = await this.flattenContract(source, file, data, JSON.parse(input))
        }
        const ast = result.length > 1 ? parser.parse(result) : parser.parse(source.sources[file].content)
        this.umlClasses = convertAST2UmlClasses(ast, this.currentFile)
        nameUnnamedFunctions(ast, this.umlClasses)
        this.mainClassId = findMainClass(this.umlClasses, this.currentFile)?.id
        this.activeTheme = await this.call('theme', 'currentTheme')
        this.updatedSvg = await this.renderDiagram(true)
        trackMatomoEvent(this, { category: 'solidityumlgen', action: 'umlgenerated', isClick: false })
      } catch (error) {
        console.error('Solidity UML Generator:', error)
        this.umlClasses = []
        this.updatedSvg = ''
        this.renderError = true
      }
      this.loading = false
      this.renderComponent()
      await this.call('tabs', 'focus', 'solidityumlgen')
    })
  }

  getThemeCssVariables(cssVars: string) {
    return window.getComputedStyle(document.documentElement).getPropertyValue(cssVars)
  }

  /**
   * Renders the current classes to SVG. Ortho routing can fail on some graphs,
   * in which case the diagram is drawn again with curved lines.
   * @param useCssVars read colours from the theme stylesheet. Pass false while the
   * stylesheet is still loading, so the theme's fallback colours are used instead.
   */
  private async renderDiagram(useCssVars: boolean): Promise<string> {
    const palette = resolveUmlPalette(this.activeTheme, useCssVars ? (name) => this.getThemeCssVariables(name) : undefined)
    const render = async (splines: 'ortho' | 'true') => {
      const viz = await getViz()
      try {
        return viz.render(convertUmlClasses2Dot(this.umlClasses, { palette, mainClassId: this.mainClassId, splines }), { format: 'svg' })
      } catch (error) {
        // A thrown error, rather than a failed result, can leave the Graphviz module unusable: load a fresh one
        vizPromise = undefined
        return { status: 'failure' as const, output: undefined, errors: [{ level: 'error' as const, message: String(error) }]}
      }
    }
    let result = await render('ortho')
    if (result.status !== 'success') result = await render('true')
    if (result.status !== 'success') {
      throw new Error(result.errors.map((e) => e.message).join('\n'))
    }
    return applyDisplayFont(result.output)
  }

  private handleThemeChange() {
    // Fired before the new theme stylesheet has loaded, so CSS variables are not read yet
    this.on('theme', 'themeChanged', async (theme) => {
      this.currentlySelectedTheme = theme.quality
      this.activeTheme = theme
      this.themeDark = theme.backgroundColor
      // Keep showing the error message rather than an empty diagram
      if (this.renderError) return
      await this.redraw(false)
      await this.call('tabs', 'focus', 'solidityumlgen')
    })
    // Fired once the stylesheet has loaded: redraw with the theme's CSS variables
    this.on('theme', 'themeLoaded', async (theme) => {
      if (this.umlClasses.length === 0) return
      this.activeTheme = { ...this.activeTheme, ...theme }
      await this.redraw(true)
    })
  }

  /** Redraws in the active theme. If that fails, the diagram already shown stays. */
  private async redraw(useCssVars: boolean) {
    try {
      this.updatedSvg = await this.renderDiagram(useCssVars)
      this.renderComponent()
    } catch (error) {
      console.error('Solidity UML Generator:', error)
    }
  }

  onDeactivation(): void {
    this.off('solidity', 'compilationFinished')
  }

  generateCustomAction = async (action: customAction) => {
    this.triggerGenerateUml = true
    this.updatedSvg = this.updatedSvg.startsWith('<?xml') ? '' : this.updatedSvg
    trackMatomoEvent(this, { category: 'solidityumlgen', action: 'activated', isClick: true })
    await this.generateUml(action.path[0])
  }

  async generateUml(currentFile: string) {
    // Shown before compiling, as the diagram can be finished before compile() returns
    this.loading = true
    this.renderError = false
    this.renderComponent()
    await this.call('solidity', 'compile', currentFile)
    await this.call('tabs', 'focus', 'solidityumlgen')
  }

  /**
   * Takes currently compiled contract that has a bunch of imports at the top
   * and flattens them ready for UML creation. Takes the flattened result
   * and assigns to a local property
   * @returns {Promise<string>}
   */
  async flattenContract(source: any, filePath: string, data: any, input: CompilerInput) {
    const result = await this.call('contractflattener', 'flattenContract', source, filePath, data, input)
    return result
  }

  hideSpinner() {
    this.loading = false
    this.renderComponent()
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  render() {
    return (
      <div id="sol-uml-gen">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  renderComponent() {
    this.dispatch({
      ...this,
      updatedSvg: this.updatedSvg,
      loading: this.loading,
      renderError: this.renderError,
      themeSelected: this.currentlySelectedTheme,
      themeName: this.themeName,
      themeDark: this.themeDark,
      fileName: this.currentFile,
      themeCollection: this.themeCollection,
      activeTheme: this.activeTheme
    })
  }

  updateComponent(state: any) {
    return (
      <RemixUiSolidityUmlGen
        updatedSvg={state.updatedSvg}
        loading={state.loading}
        renderError={state.renderError}
        themeSelected={state.currentlySelectedTheme}
        themeName={state.themeName}
        fileName={state.fileName}
        themeCollection={state.themeCollection}
        themeDark={state.themeDark}
      />
    )
  }
}
