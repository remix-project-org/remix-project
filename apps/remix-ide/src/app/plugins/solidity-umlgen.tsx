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
import vizRenderStringSync from '@aduh95/viz.js/sync'
import { PluginViewWrapper } from '@remix-ui/helper'
import { customAction } from '@remixproject/plugin-api'
import { ClassOptions } from 'sol2uml/lib/converterClass2Dot'
import type { CompilerInput } from '@remix-project/remix-solidity'
const parser = (window as any).SolidityParser

const profile = {
  name: 'solidityumlgen',
  displayName: 'Solidity UML Generator',
  description: 'Generates UML diagram in svg format from last compiled contract',
  location: 'mainPanel',
  methods: ['showUmlDiagram', 'generateUml', 'generateCustomAction'],
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
  triggerGenerateUml: boolean
  umlClasses: UmlClass[] = []

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
        let umlDot = ''
        this.activeTheme = await this.call('theme', 'currentTheme')
        umlDot = convertUmlClasses2Dot(this.umlClasses, false, {
          backColor: this.activeTheme.backgroundColor,
          textColor: this.activeTheme.textColor,
          shapeColor: this.activeTheme.shapeColor,
          fillColor: this.activeTheme.fillColor
        })
        const payload = vizRenderStringSync(umlDot)
        this.updatedSvg = payload
        trackMatomoEvent(this, { category: 'solidityUMLGen', action: 'umlgenerated', isClick: false })
        this.renderComponent()
        await this.call('tabs', 'focus', 'solidityumlgen')
      } catch (error) {
        console.log('error', error)
      }
    })
  }

  getThemeCssVariables(cssVars: string) {
    return window.getComputedStyle(document.documentElement).getPropertyValue(cssVars)
  }

  private handleThemeChange() {
    this.on('theme', 'themeChanged', async (theme) => {
      this.currentlySelectedTheme = theme.quality
      this.activeTheme = theme
      this.themeDark = theme.backgroundColor
      const umlDot = convertUmlClasses2Dot(this.umlClasses, false, {
        backColor: this.activeTheme.backgroundColor,
        textColor: this.activeTheme.textColor,
        shapeColor: this.activeTheme.shapeColor,
        fillColor: this.activeTheme.fillColor
      })
      this.updatedSvg = vizRenderStringSync(umlDot)
      this.renderComponent()
      await this.call('tabs', 'focus', 'solidityumlgen')
    })
  }

  onDeactivation(): void {
    this.off('solidity', 'compilationFinished')
  }

  generateCustomAction = async (action: customAction) => {
    this.triggerGenerateUml = true
    this.updatedSvg = this.updatedSvg.startsWith('<?xml') ? '' : this.updatedSvg
    trackMatomoEvent(this, { category: 'solidityUMLGen', action: 'activated', isClick: true })
    await this.generateUml(action.path[0])
  }

  async generateUml(currentFile: string) {
    await this.call('solidity', 'compile', currentFile)
    await this.call('tabs', 'focus', 'solidityumlgen')
    this.loading = true
    this.renderComponent()
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

  async showUmlDiagram(svgPayload: string) {
    this.updatedSvg = svgPayload
    this.renderComponent()
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
        themeSelected={state.currentlySelectedTheme}
        themeName={state.themeName}
        fileName={state.fileName}
        themeCollection={state.themeCollection}
        themeDark={state.themeDark}
      />
    )
  }
}

interface Sol2umlClassOptions extends ClassOptions {
  backColor?: string
  shapeColor?: string
  fillColor?: string
  textColor?: string
}

import { dirname } from 'path'
import { convertClass2Dot } from 'sol2uml/lib/converterClass2Dot'
import { Association, ClassStereotype, ReferenceType, UmlClass } from 'sol2uml/lib/umlClass'
import { findAssociatedClass } from 'sol2uml/lib/associations'

// const debug = require('debug')('sol2uml')

/**
 * Converts UML classes to Graphviz's DOT format.
 * The DOT grammar defines Graphviz nodes, edges, graphs, subgraphs, and clusters http://www.graphviz.org/doc/info/lang.html
 * @param umlClasses array of UML classes of type `UMLClass`
 * @param clusterFolders flag if UML classes are to be clustered into folders their source code was in
 * @param classOptions command line options for the `class` command
 * @return dotString Graphviz's DOT format for defining nodes, edges and clusters.
 */
export function convertUmlClasses2Dot(umlClasses: UmlClass[], clusterFolders: boolean = false, classOptions: Sol2umlClassOptions = {}): string {
  let dotString: string = `
digraph UmlClassDiagram {
rankdir=BT
arrowhead=open
bgcolor="${classOptions.backColor}"
edge [color="${classOptions.shapeColor}"]
node [shape=record, style=filled, color="${classOptions.shapeColor}", fillcolor="${classOptions.fillColor}", fontcolor="${classOptions.textColor}"]`

  // Sort UML Classes by folder of source file
  const umlClassesSortedByCodePath = sortUmlClassesByCodePath(umlClasses)

  let currentCodeFolder = ''
  for (const umlClass of umlClassesSortedByCodePath) {
    const codeFolder = dirname(umlClass.relativePath)
    if (currentCodeFolder !== codeFolder) {
      // Need to close off the last subgraph if not the first
      if (currentCodeFolder != '') {
        dotString += '\n}'
      }

      dotString += `
subgraph ${getSubGraphName(clusterFolders)} {
label="${codeFolder}"`

      currentCodeFolder = codeFolder
    }
    dotString += convertClass2Dot(umlClass, classOptions)
  }

  // Need to close off the last subgraph if not the first
  if (currentCodeFolder != '') {
    dotString += '\n}'
  }

  dotString += addAssociationsToDot(umlClasses, classOptions)

  // Need to close off the last the digraph
  dotString += '\n}'

  // debug(dotString)

  return dotString
}

let subGraphCount = 0
function getSubGraphName(clusterFolders: boolean = false) {
  if (clusterFolders) {
    return ` cluster_${subGraphCount++}`
  }
  return ` graph_${subGraphCount++}`
}

function sortUmlClassesByCodePath(umlClasses: UmlClass[]): UmlClass[] {
  return umlClasses.sort((a, b) => {
    if (a.relativePath < b.relativePath) {
      return -1
    }
    if (a.relativePath > b.relativePath) {
      return 1
    }
    return 0
  })
}

export function addAssociationsToDot(umlClasses: UmlClass[], classOptions: ClassOptions = {}): string {
  let dotString: string = ''

  // for each class
  for (const sourceUmlClass of umlClasses) {
    if (!classOptions.hideEnums) {
      // for each enum in the class
      sourceUmlClass.enums.forEach((enumId) => {
        // Has the enum been filtered out? eg depth limited
        const targetUmlClass = umlClasses.find((c) => c.id === enumId)
        if (targetUmlClass) {
          // Draw aggregated link from contract to contract level Enum
          dotString += `\n${enumId} -> ${sourceUmlClass.id} [arrowhead=diamond, weight=2]`
        }
      })
    }
    if (!classOptions.hideStructs) {
      // for each struct in the class
      sourceUmlClass.structs.forEach((structId) => {
        // Has the struct been filtered out? eg depth limited
        const targetUmlClass = umlClasses.find((c) => c.id === structId)
        if (targetUmlClass) {
          // Draw aggregated link from contract to contract level Struct
          dotString += `\n${structId} -> ${sourceUmlClass.id} [arrowhead=diamond, weight=2]`
        }
      })
    }

    // for each association in that class
    for (const association of Object.values(sourceUmlClass.associations)) {
      const targetUmlClass = findAssociatedClass(association, sourceUmlClass, umlClasses)
      if (targetUmlClass) {
        dotString += addAssociationToDot(sourceUmlClass, targetUmlClass, association, classOptions)
      }
    }
  }

  return dotString
}

function addAssociationToDot(sourceUmlClass: UmlClass, targetUmlClass: UmlClass, association: Association, classOptions: ClassOptions = {}): string {
  // do not include library or interface associations if hidden
  // Or associations to Structs, Enums or Constants if they are hidden
  if (
    (classOptions.hideLibraries && (sourceUmlClass.stereotype === ClassStereotype.Library || targetUmlClass.stereotype === ClassStereotype.Library)) ||
    (classOptions.hideInterfaces && (targetUmlClass.stereotype === ClassStereotype.Interface || sourceUmlClass.stereotype === ClassStereotype.Interface)) ||
    (classOptions.hideAbstracts && (targetUmlClass.stereotype === ClassStereotype.Abstract || sourceUmlClass.stereotype === ClassStereotype.Abstract)) ||
    (classOptions.hideStructs && targetUmlClass.stereotype === ClassStereotype.Struct) ||
    (classOptions.hideEnums && targetUmlClass.stereotype === ClassStereotype.Enum) ||
    (classOptions.hideConstants && targetUmlClass.stereotype === ClassStereotype.Constant)
  ) {
    return ''
  }

  let dotString = `\n${sourceUmlClass.id} -> ${targetUmlClass.id} [`

  if (association.referenceType == ReferenceType.Memory || (association.realization && targetUmlClass.stereotype === ClassStereotype.Interface)) {
    dotString += 'style=dashed, '
  }

  if (association.realization) {
    dotString += 'arrowhead=empty, arrowsize=3, '
    if (!targetUmlClass.stereotype) {
      dotString += 'weight=4, '
    } else {
      dotString += 'weight=3, '
    }
  }

  return dotString + ']'
}
