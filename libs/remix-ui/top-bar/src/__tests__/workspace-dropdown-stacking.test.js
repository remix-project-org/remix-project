// Regression guard for https://github.com/remix-project-org/remix-project/issues/7574
// "slider appears over workspace dropdown"
//
// Root cause (CSS stacking):
//   - The left panel-resize dragbar (`.dragbar` in
//     libs/remix-ui/app/src/lib/remix-app/components/dragbar/dragbar.css) is a
//     `position: absolute` 6px vertical slider with `z-index: 1000`.
//   - The workspace dropdown menu is a Bootstrap `.dropdown-menu`, which defaults
//     to `z-index: var(--bs-dropdown-zindex)` = 1000.
//   - Neither `.top-bar` nor `.remixIDE` creates a stacking context, so both live
//     in the root stacking context. With equal z-index the paint order falls back
//     to DOM order, and the dragbar (rendered after the top bar) paints ON TOP of
//     the open workspace dropdown — the "slider appears over the workspace
//     dropdown" bug.
//
// Invariant pinned here: the workspace dropdown menu must declare an inline
// z-index strictly greater than the panel dragbar slider's z-index.
//
// Lightweight, dependency-free test (node built-ins only) so it can run anywhere:
//   node libs/remix-ui/top-bar/src/__tests__/workspace-dropdown-stacking.test.js

const assert = require('assert')
const fs = require('fs')
const path = require('path')

// test file: libs/remix-ui/top-bar/src/__tests__/ -> repo root is 5 levels up
const ROOT = path.resolve(__dirname, '../../../../..')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// 1. The panel dragbar slider's z-index (the thing that must NOT cover the dropdown).
const dragbarCss = read('libs/remix-ui/app/src/lib/remix-app/components/dragbar/dragbar.css')
const dragbarRule = dragbarCss.match(/\.dragbar\s*\{([\s\S]*?)\}/)
assert.ok(dragbarRule, 'dragbar.css must contain a `.dragbar { }` rule')
const dragbarZ = parseInt((dragbarRule[1].match(/z-index\s*:\s*(\d+)/) || [])[1] || '', 10)
assert.ok(Number.isInteger(dragbarZ), 'expected ".dragbar" to declare an integer z-index, got: ' + dragbarRule[1])

// 2. The workspace dropdown menu's inline z-index.
const dropdownSrc = read('libs/remix-ui/top-bar/src/components/WorkspaceDropdown.tsx')
const menuTag = dropdownSrc.match(/<Dropdown\.Menu[\s\S]*?style=\{\{\s*([\s\S]*?)\s*\}\}/)
assert.ok(menuTag, 'WorkspaceDropdown.tsx must contain a `<Dropdown.Menu style={{ ... }}>`')
const styleBody = menuTag[1]
const dropdownZ = parseInt((styleBody.match(/zIndex\s*:\s*(\d+)/) || [])[1] || '', 10)

// 3. The invariant.
console.log(`workspace dropdown menu inline z-index : ${Number.isInteger(dropdownZ) ? dropdownZ : '<none>'}`)
console.log(`panel dragbar slider z-index            : ${dragbarZ}`)

assert.ok(Number.isInteger(dropdownZ),
  'Workspace dropdown menu must declare an explicit inline z-index ' +
  '(regression for #7574: the panel dragbar slider renders on top of the open dropdown when both are z-index 1000)')
assert.ok(dropdownZ > dragbarZ,
  `Workspace dropdown menu z-index (${dropdownZ}) must be greater than the panel dragbar slider z-index (${dragbarZ}) ` +
  'so the slider no longer paints over the open dropdown (issue #7574)')

console.log('OK: workspace dropdown stacks above the panel dragbar slider (issue #7574)')
