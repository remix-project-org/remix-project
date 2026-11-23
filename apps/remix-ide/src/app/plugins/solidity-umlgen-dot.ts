import { Association, Attribute, ClassStereotype, Operator, OperatorStereotype, Parameter, ReferenceType, UmlClass, Visibility } from 'sol2uml/lib/umlClass'
import { findAssociatedClass } from 'sol2uml/lib/associations'

/**
 * Graphviz only has text metrics for a few built-in fonts and falls back to the
 * narrower Times metrics for anything else, which clips text. Layout is therefore
 * measured with Arial, and the diagram is drawn in Arial or a metric-compatible
 * fallback. Graphviz places each styled text run at a fixed position, so a wider
 * font such as Nunito Sans runs into the next run on long lines.
 */
const LAYOUT_FONT = 'Arial'
const DISPLAY_FONT = 'Arial, Helvetica, Liberation Sans, sans-serif'

export interface UmlTheme {
  quality: string
  backgroundColor?: string
  textColor?: string
  shapeColor?: string
  fillColor?: string
}

interface HeaderColors {
  fill: string
  text: string
}

export interface UmlPalette {
  canvas: string
  body: string
  border: string
  name: string
  dim: string
  bandBg: string
  bandText: string
  mainHeader: HeaderColors
  mainBorder: string
  contractHeader: HeaderColors
  abstractHeader: HeaderColors
  interfaceHeader: HeaderColors
  libraryHeader: HeaderColors
  dataHeader: HeaderColors
  inherits: string
  implements: string
  calls: string
  usesType: string
  modifier: string
}

const WHITE = '#ffffff'
const DARK_TEXT = '#222336'

const isHexColor = (value?: string) => !!value && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())

/**
 * Resolves the diagram colours from the active Remix theme.
 * @param theme the theme object emitted by the theme module
 * @param readCssVar reads a CSS custom property from the page. Omit it while the
 * theme stylesheet is still loading so the fallback values for the theme are used.
 */
export function resolveUmlPalette(theme: UmlTheme, readCssVar?: (name: string) => string): UmlPalette {
  const dark = theme.quality === 'dark'
  const pick = (light: string, darkValue: string) => (dark ? darkValue : light)
  const cssVar = (name: string, fallback: string) => {
    const value = readCssVar ? readCssVar(name) : ''
    return isHexColor(value) ? value.trim() : fallback
  }
  const themeValue = (value: string | undefined, fallback: string) => (isHexColor(value) ? value.trim() : fallback)

  const name = themeValue(theme.textColor, pick('#3b445e', '#babbcc'))
  const success = cssVar('--bs-success', pick('#18bc9c', '#00bc8c'))
  const warning = cssVar('--bs-warning', '#f39c12')

  return {
    canvas: themeValue(theme.backgroundColor, pick('#eef1f6', '#222336')),
    body: themeValue(theme.fillColor, pick('#ffffff', '#2a2c3f')),
    border: cssVar('--bs-border-color', pick('#dadbe0', '#3f4455')),
    name,
    // --bs-body-color is too close to the name colour in dark mode
    dim: dark ? '#8e94a6' : cssVar('--bs-body-color', '#747b90'),
    bandBg: dark ? cssVar('--bs-secondary-bg', '#333446') : cssVar('--bs-body-bg', '#eff1f5'),
    bandText: dark ? '#a2a3bd' : name,
    mainHeader: { fill: cssVar('--bs-primary', '#007aa6'), text: WHITE },
    mainBorder: dark ? cssVar('--custom-primary', '#64c4ff') : cssVar('--bs-primary', '#007aa6'),
    contractHeader: { fill: dark ? cssVar('--custom-border-light', '#51536b') : '#3b445e', text: WHITE },
    abstractHeader: { fill: cssVar('--bs-purple', '#6f42c1'), text: WHITE },
    interfaceHeader: { fill: success, text: DARK_TEXT },
    libraryHeader: { fill: warning, text: DARK_TEXT },
    dataHeader: { fill: '#a2a3bd', text: DARK_TEXT },
    inherits: themeValue(theme.shapeColor, pick('#343a40', '#babbcc')),
    implements: success,
    calls: cssVar('--custom-primary', pick('#007aa6', '#64c4ff')),
    usesType: pick('#8e94a6', '#a2a3bd'),
    modifier: dark ? warning : cssVar('--bs-warning-text-emphasis', '#613e07')
  }
}

export interface UmlDotOptions {
  palette: UmlPalette
  /** id of the class to highlight as the contract the diagram was generated for */
  mainClassId?: number
  /** 'ortho' gives right-angled lines; 'true' is the fallback when ortho routing fails */
  splines?: 'ortho' | 'true'
}

const DATA_STEREOTYPES = [ClassStereotype.Struct, ClassStereotype.Enum, ClassStereotype.Constant]

const isRendered = (umlClass: UmlClass) => umlClass.stereotype !== ClassStereotype.Import

/**
 * Picks the contract the diagram was generated for: the class named after the
 * file if there is one, otherwise the last contract in the source. Flattening
 * puts the selected file's own code after its imports.
 * @param fileName file name without extension, as passed to convertAST2UmlClasses
 */
export function findMainClass(umlClasses: UmlClass[], fileName: string): UmlClass | undefined {
  const candidates = umlClasses.filter((c) => isRendered(c) && !DATA_STEREOTYPES.includes(c.stereotype)).sort((a, b) => a.id - b.id)
  const baseName = (fileName || '').split('/').pop()
  const names = [baseName, baseName.replace(/^\d+_/, '')]
  const byName = candidates.filter((c) => names.includes(c.name))
  if (byName.length) return byName[byName.length - 1]
  const contracts = candidates.filter((c) => c.stereotype === ClassStereotype.Contract)
  if (contracts.length) return contracts[contracts.length - 1]
  return candidates[candidates.length - 1]
}

/** sol2uml escapes characters for record labels, e.g. mapping\(address=\>uint256\) */
const clean = (value?: string | number) => String(value ?? '').replace(/\\/g, '')

const escapeHtml = (value?: string | number) => clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const text = (value: string, color: string, style: { size?: number; bold?: boolean } = {}) => {
  const size = style.size ? ` point-size="${style.size}"` : ''
  const content = style.bold ? `<b>${value}</b>` : value
  return `<font color="${color}"${size}>${content}</font>`
}

const typeLabel = (stereotype?: ClassStereotype) => {
  switch (stereotype) {
  case ClassStereotype.Abstract:
    return 'ABSTRACT CONTRACT'
  case ClassStereotype.Interface:
    return 'INTERFACE'
  case ClassStereotype.Library:
    return 'LIBRARY'
  case ClassStereotype.Struct:
    return 'STRUCT'
  case ClassStereotype.Enum:
    return 'ENUM'
  case ClassStereotype.Constant:
    return 'CONSTANT'
  default:
    return 'CONTRACT'
  }
}

const headerColors = (stereotype: ClassStereotype | undefined, palette: UmlPalette): HeaderColors => {
  switch (stereotype) {
  case ClassStereotype.Abstract:
    return palette.abstractHeader
  case ClassStereotype.Interface:
    return palette.interfaceHeader
  case ClassStereotype.Library:
    return palette.libraryHeader
  case ClassStereotype.Struct:
  case ClassStereotype.Enum:
  case ClassStereotype.Constant:
    return palette.dataHeader
  default:
    return palette.contractHeader
  }
}

/**
 * Graphviz positions each styled text run from its own width estimate, and it
 * measures non-ASCII characters such as → per UTF-8 byte at the width of a space.
 * That underestimates some runs. No-break spaces are estimated at twice their
 * drawn width, so they keep a visible gap before the next run and the box edge.
 */
const GAP = '&#160;&#160;'

const band = (title: string, palette: UmlPalette, colspan = 1) =>
  `<tr><td align="left" bgcolor="${palette.bandBg}" cellpadding="5"${colspan > 1 ? ` colspan="${colspan}"` : ''}>${text(escapeHtml(title), palette.bandText, { size: 9, bold: true })}</td></tr>`

const row = (content: string) => `<tr><td align="left" cellpadding="3">${content}&#160;</td></tr>`

// Visibility groups. Members without a visibility are listed as public, as sol2uml does.
const isPublic = (visibility?: Visibility) => visibility === Visibility.Public || visibility === Visibility.None || !visibility
const VISIBILITY_GROUPS: { [key: string]: (visibility?: Visibility) => boolean } = {
  PUBLIC: isPublic,
  EXTERNAL: (visibility) => visibility === Visibility.External,
  INTERNAL: (visibility) => visibility === Visibility.Internal,
  PRIVATE: (visibility) => visibility === Visibility.Private
}
const STATE_ORDER = ['PUBLIC', 'EXTERNAL', 'INTERNAL', 'PRIVATE']
const FUNCTION_ORDER = ['EXTERNAL', 'PUBLIC', 'INTERNAL', 'PRIVATE']

const sourceContractTag = (member: Attribute, palette: UmlPalette) => (member.sourceContract ? text(GAP + escapeHtml(`«${member.sourceContract}»`), palette.dim, { size: 10 }) : '')

const attributeRow = (attribute: Attribute, separator: string, palette: UmlPalette) => {
  const type = attribute.type !== undefined && attribute.type !== '' ? text(escapeHtml(`${separator}${clean(attribute.type)}`), palette.dim) : ''
  return row(`${text(escapeHtml(attribute.name), palette.name, { bold: true })}${type}${sourceContractTag(attribute, palette)}`)
}

const formatParameters = (parameters: Parameter[] = []) => parameters.map((p) => (p.name ? `${clean(p.name)}: ${clean(p.type)}` : clean(p.type))).join(', ')

const formatReturns = (parameters: Parameter[] = []) => {
  if (parameters.length === 0) return ''
  if (parameters.length === 1 && !parameters[0].name) return clean(parameters[0].type)
  return `(${formatParameters(parameters)})`
}

const isUnnamedFunction = (operator: Operator) => !operator.name && operator.stereotype !== OperatorStereotype.Modifier && operator.stereotype !== OperatorStereotype.Event

/**
 * sol2uml leaves receive() and fallback() without a name when the parser reports
 * a null name, and drops the parser's flags that tell them apart. This copies the
 * names from the AST, matching contracts in source order.
 * @param ast the AST passed to convertAST2UmlClasses. Classes are mutated.
 */
export function nameUnnamedFunctions(ast: any, umlClasses: UmlClass[]): void {
  const contracts = umlClasses.filter((c) => isRendered(c) && !DATA_STEREOTYPES.includes(c.stereotype)).sort((a, b) => a.id - b.id)
  const matched = new Set<number>()
  for (const node of ast?.children || []) {
    if (node.type !== 'ContractDefinition') continue
    const umlClass = contracts.find((c) => !matched.has(c.id) && c.name === node.name)
    if (!umlClass) continue
    matched.add(umlClass.id)
    const names = (node.subNodes || []).filter((n) => n.type === 'FunctionDefinition' && !n.name && !n.isConstructor).map((n) => (n.isReceiveEther ? 'receive' : 'fallback'))
    umlClass.operators.filter(isUnnamedFunction).forEach((operator, i) => {
      if (names[i]) operator.name = names[i]
    })
  }
}

const operatorRow = (umlClass: UmlClass, operator: Operator, palette: UmlPalette) => {
  let content = text(escapeHtml(operator.name || 'fallback'), palette.name, { bold: true })
  content += text(escapeHtml(`(${formatParameters(operator.parameters)})`), palette.dim)
  const returns = formatReturns(operator.returnParameters)
  // The arrow is its own run, so its underestimated width is absorbed by the no-break spaces around it
  if (returns) content += text(`${GAP}→`, palette.dim) + text(`&#160;${escapeHtml(returns)}`, palette.dim)
  if (operator.stereotype === OperatorStereotype.Payable) {
    content += text(`${GAP}payable`, palette.dim, { size: 10 })
  } else if (operator.stereotype === OperatorStereotype.Abstract && umlClass.stereotype === ClassStereotype.Abstract) {
    content += text(`${GAP}abstract`, palette.dim, { size: 10 })
  }
  if (operator.modifiers?.length) {
    content += text(GAP + escapeHtml(operator.modifiers.map(clean).join(' · ')), palette.modifier, { size: 10 })
  }
  return row(content + sourceContractTag(operator, palette))
}

const isConstructor = (operator: Operator) => operator.name === 'constructor' && operator.stereotype === OperatorStereotype.None && operator.visibility === undefined

function classBody(umlClass: UmlClass, palette: UmlPalette): string[] {
  if (umlClass.stereotype === ClassStereotype.Enum) {
    return umlClass.attributes.map((attribute) => attributeRow(attribute, ' = ', palette))
  }
  if (DATA_STEREOTYPES.includes(umlClass.stereotype)) {
    return umlClass.attributes.map((attribute) => attributeRow(attribute, ': ', palette))
  }

  const rows: string[] = []
  const section = (title: string, sectionRows: string[]) => {
    if (sectionRows.length === 0) return
    rows.push(band(title, palette), ...sectionRows)
  }

  for (const group of STATE_ORDER) {
    const attributes = umlClass.attributes.filter((a) => VISIBILITY_GROUPS[group](a.visibility))
    section(`STATE · ${group}`, attributes.map((a) => attributeRow(a, ': ', palette)))
  }

  const operators = umlClass.operators
  const constructors = operators.filter(isConstructor)
  const modifiers = operators.filter((o) => o.stereotype === OperatorStereotype.Modifier)
  const events = operators.filter((o) => o.stereotype === OperatorStereotype.Event)
  const functions = operators.filter((o) => !isConstructor(o) && o.stereotype !== OperatorStereotype.Modifier && o.stereotype !== OperatorStereotype.Event)

  section('CONSTRUCTOR', constructors.map((o) => operatorRow(umlClass, o, palette)))
  for (const group of FUNCTION_ORDER) {
    const groupFunctions = functions.filter((o) => VISIBILITY_GROUPS[group](o.visibility))
    section(`FUNCTIONS · ${group}`, groupFunctions.map((o) => operatorRow(umlClass, o, palette)))
  }
  section('MODIFIERS', modifiers.map((o) => operatorRow(umlClass, o, palette)))
  section('EVENTS', events.map((o) => operatorRow(umlClass, o, palette)))
  return rows
}

function classNode(umlClass: UmlClass, palette: UmlPalette, isMain: boolean): string {
  const colors = isMain ? palette.mainHeader : headerColors(umlClass.stereotype, palette)
  const header = `<tr><td bgcolor="${colors.fill}" cellpadding="8">${text(typeLabel(umlClass.stereotype), colors.text, { size: 9 })}<br/>${text(escapeHtml(umlClass.name), colors.text, { size: 15, bold: true })}</td></tr>`
  const border = isMain ? `border="2" color="${palette.mainBorder}"` : `border="1" color="${palette.border}"`
  const table = `<table ${border} cellborder="0" cellspacing="0" bgcolor="${palette.body}">${header}${classBody(umlClass, palette).join('')}</table>`
  return `\n${umlClass.id} [label=<${table}>]`
}

function legendNode(palette: UmlPalette): string {
  const cell = (content: string, colspan = 1) => `<td align="left" cellpadding="3"${colspan > 1 ? ` colspan="${colspan}"` : ''}>${content}&#160;</td>`
  const entry = (sample: string, description: string) => `<tr>${cell(sample)}${cell(text(description, palette.name))}</tr>`
  const rows = [
    band('HOW TO READ THE LINES', palette, 2),
    entry(text('───▷', palette.inherits, { bold: true }), 'Inherits from'),
    entry(text('╌╌╌▷', palette.implements), 'Implements an interface'),
    entry(text('───&gt;', palette.calls), 'Calls or references a contract or library'),
    entry(text('───◇', palette.usesType), 'Uses a struct, enum or constant'),
    entry(text('◆───', palette.usesType), 'Defines a struct or enum (diamond at the owner)'),
    entry(text('onlyOwner', palette.modifier, { size: 10 }), 'Modifiers applied to a function'),
    `<tr>${cell(text('Dashed call or use lines: only used inside a function', palette.dim), 2)}</tr>`
  ]
  const table = `<table border="1" cellborder="0" cellspacing="0" color="${palette.border}" bgcolor="${palette.body}">${rows.join('')}</table>`
  return `\nsubgraph legend_rank {\nrank=min\nlegend [label=<${table}>]\n}`
}

function associationEdges(umlClasses: UmlClass[], renderedIds: Set<number>, palette: UmlPalette): string {
  let dotString = ''
  const owned = new Set<string>()

  // A struct or enum defined inside a contract: filled diamond at the owner
  for (const owner of umlClasses) {
    if (!renderedIds.has(owner.id)) continue
    for (const id of [...(owner.enums || []), ...(owner.structs || [])]) {
      if (id === owner.id || !renderedIds.has(id)) continue
      owned.add(`${owner.id}:${id}`)
      dotString += `\n${id} -> ${owner.id} [color="${palette.usesType}", arrowhead=diamond, weight=2]`
    }
  }

  for (const source of umlClasses) {
    if (!renderedIds.has(source.id)) continue
    for (const association of Object.values(source.associations) as Association[]) {
      const target = findAssociatedClass(association, source, umlClasses)
      if (!target || target.id === source.id || !renderedIds.has(target.id)) continue
      const dashed = association.referenceType === ReferenceType.Memory ? ', style=dashed' : ''

      if (association.realization) {
        if (target.stereotype === ClassStereotype.Interface) {
          dotString += `\n${source.id} -> ${target.id} [color="${palette.implements}", style=dashed, arrowhead=onormal, weight=3]`
        } else {
          dotString += `\n${source.id} -> ${target.id} [color="${palette.inherits}", arrowhead=onormal, penwidth=2, weight=${target.stereotype ? 3 : 4}]`
        }
      } else if (DATA_STEREOTYPES.includes(target.stereotype)) {
        if (owned.has(`${source.id}:${target.id}`)) continue
        dotString += `\n${source.id} -> ${target.id} [color="${palette.usesType}", arrowhead=odiamond${dashed}]`
      } else {
        dotString += `\n${source.id} -> ${target.id} [color="${palette.calls}", arrowhead=vee${dashed}]`
      }
    }
  }
  return dotString
}

/**
 * Converts UML classes to Graphviz DOT, drawing each class as an HTML-like table.
 * @param umlClasses classes from sol2uml's convertAST2UmlClasses
 */
export function convertUmlClasses2Dot(umlClasses: UmlClass[], options: UmlDotOptions): string {
  const { palette } = options
  const rendered = umlClasses.filter(isRendered).sort((a, b) => a.id - b.id)
  const renderedIds = new Set(rendered.map((c) => c.id))

  let dotString = `digraph UmlClassDiagram {
rankdir=BT
pad=0.4
nodesep=2.6
ranksep=1.8
splines=${options.splines || 'ortho'}
bgcolor="${palette.canvas}"
node [shape=plain, fontname="${LAYOUT_FONT}", fontsize=12, fontcolor="${palette.name}"]
edge [fontname="${LAYOUT_FONT}", fontsize=13, penwidth=1.6, arrowsize=1.1]`

  for (const umlClass of rendered) {
    dotString += classNode(umlClass, palette, umlClass.id === options.mainClassId)
  }
  if (rendered.length > 0) {
    dotString += legendNode(palette)
  }
  dotString += associationEdges(umlClasses, renderedIds, palette)
  return dotString + '\n}'
}

/** Swaps the layout font for the display font in rendered SVG. */
export function applyDisplayFont(svg: string): string {
  return svg.replace(new RegExp(`font-family="${LAYOUT_FONT}[^"]*"`, 'g'), `font-family="${DISPLAY_FONT}"`)
}
