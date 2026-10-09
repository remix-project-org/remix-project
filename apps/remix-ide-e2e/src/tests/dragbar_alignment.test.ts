'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const alignmentTolerance = 4

function assertLeftDragbarAligned(browser: NightwatchBrowser, message: string) {
  return browser.execute(function (panelSelector, dragbarSelector, tolerance) {
    const panel = document.querySelector(panelSelector) as HTMLElement | null
    const dragbar = document.querySelector(dragbarSelector) as HTMLElement | null

    if (!panel || !dragbar) {
      return {
        ok: false,
        reason: 'missing-element'
      }
    }

    const panelRect = panel.getBoundingClientRect()
    const dragbarRect = dragbar.getBoundingClientRect()
    const dragbarCenterX = dragbarRect.left + (dragbarRect.width / 2)
    const delta = Math.abs(panelRect.right - dragbarCenterX)

    return {
      ok: delta <= tolerance,
      delta,
      panelEdge: panelRect.right,
      dragbarCenter: dragbarCenterX
    }
  }, ['#side-panel', '#sidepanel-dragbar-draggable', alignmentTolerance], function (result: any) {
    const value = result.value
    browser.assert.ok(
      value.ok,
      `${message}. delta=${value?.delta}, panelEdge=${value?.panelEdge}, dragbarCenter=${value?.dragbarCenter}`
    )
  })
}

function assertRightDragbarAligned(browser: NightwatchBrowser, message: string) {
  return browser.execute(function (panelSelector, dragbarSelector, tolerance) {
    const panel = document.querySelector(panelSelector) as HTMLElement | null
    const dragbar = document.querySelector(dragbarSelector) as HTMLElement | null

    if (!panel || !dragbar) {
      return {
        ok: false,
        reason: 'missing-element'
      }
    }

    const panelRect = panel.getBoundingClientRect()
    const dragbarRect = dragbar.getBoundingClientRect()
    const dragbarCenterX = dragbarRect.left + (dragbarRect.width / 2)
    const delta = Math.abs(panelRect.left - dragbarCenterX)

    return {
      ok: delta <= tolerance,
      delta,
      panelEdge: panelRect.left,
      dragbarCenter: dragbarCenterX
    }
  }, ['#right-side-panel', '*[data-right-sidepanel="rightSidepanel-dragbar-draggable"]', alignmentTolerance], function (result: any) {
    const value = result.value
    console.log('Right dragbar alignment check:', value)
    browser
      .pause(2000)
      .assert.ok(
        value.ok,
        `${message}. delta=${value?.delta}, panelEdge=${value?.panelEdge}, dragbarCenter=${value?.dragbarCenter}`
      )
  })
}

function assertTerminalDragbarAligned(browser: NightwatchBrowser, message: string) {
  return browser.execute(function (panelSelector, dragbarSelector, tolerance) {
    const panel = document.querySelector(panelSelector) as HTMLElement | null
    const dragbar = document.querySelector(dragbarSelector) as HTMLElement | null

    if (!panel || !dragbar) {
      return {
        ok: false,
        reason: 'missing-element'
      }
    }

    const panelRect = panel.getBoundingClientRect()
    const dragbarRect = dragbar.getBoundingClientRect()
    const dragbarCenterY = dragbarRect.top + (dragbarRect.height / 2)
    const delta = Math.abs(panelRect.top - dragbarCenterY)

    return {
      ok: delta <= tolerance,
      delta,
      panelEdge: panelRect.top,
      dragbarCenter: dragbarCenterY
    }
  }, ['.terminal-wrap', '.dragbar_terminal', alignmentTolerance], function (result: any) {
    const value = result.value
    browser.assert.ok(
      value.ok,
      `${message}. delta=${value?.delta}, panelEdge=${value?.panelEdge}, dragbarCenter=${value?.dragbarCenter}`
    )
  })
}

const leftDragbar = '[data-id="sidepanel-dragbar-draggable"]'
const rightDragbar = '*[data-right-sidepanel="rightSidepanel-dragbar-draggable"]'

function assertPanelWidth(browser: NightwatchBrowser, panelSelector: string, expected: number, message: string) {
  return browser.execute(function (selector) {
    const panel = document.querySelector(selector) as HTMLElement | null
    return panel ? panel.getBoundingClientRect().width : -1
  }, [panelSelector], function (result: any) {
    browser.assert.ok(Math.abs(result.value - expected) <= alignmentTolerance, `${message}. width=${result.value}, expected=${expected}`)
  })
}

// Drags a dragbar horizontally by `offset` pixels with real pointer events
function dragBy(browser: NightwatchBrowser, dragbarSelector: string, offset: number) {
  return browser.execute(function (selector) {
    const rect = (document.querySelector(selector) as HTMLElement).getBoundingClientRect()
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
  }, [dragbarSelector], function (result: any) {
    const { x, y } = result.value
    browser.perform(function () {
      const actions = this.actions({ async: true })
      return actions
        .move({ origin: 'viewport', x, y })
        .press()
        .move({ origin: 'viewport', x: x + Math.round(offset / 2), y })
        .move({ origin: 'viewport', x: x + offset, y })
        .release()
    }).pause(1000)
  })
}

module.exports = {
  '@disabled': false,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080?plugins=solidity,udapp', false, undefined, true, false)
  },

  'Left dragbar should align with the default side-panel edge #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#side-panel', 10000)
      .moveTo('[data-id="sidepanel-dragbar-draggable"]', 0, 0)
      .waitForElementVisible('[data-id="sidepanel-dragbar-draggable"]', 5000)
      .pause(500)

    assertLeftDragbarAligned(browser, 'Left dragbar should align with the default side-panel edge')
  },

  'Left dragbar should align after an enhanced side-panel plugin is opened #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('udapp')
      .waitForElementVisible('#side-panel', 5000)
      .waitForElementVisible('#sidepanel-dragbar-draggable', 5000)
      .pause(1000)

    assertLeftDragbarAligned(browser, 'Left dragbar should align after UDAPP enhances the side panel')
  },

  'Left dragbar should realign after switching back to a non-enhanced plugin #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('#side-panel', 5000)
      .waitForElementVisible('#sidepanel-dragbar-draggable', 5000)
      .pause(1000)

    assertLeftDragbarAligned(browser, 'Left dragbar should realign after resetting back to the file panel')
  },

  'Double-clicking the left dragbar resets the side panel to its default width #group1': function (browser: NightwatchBrowser) {
    dragBy(browser, leftDragbar, 200)
    assertPanelWidth(browser, '#side-panel', 460, 'The side panel is wider after dragging')
    browser.doubleClick(leftDragbar).pause(1000)
    assertPanelWidth(browser, '#side-panel', 260, 'Double-click resets the side panel to 260px')
    assertLeftDragbarAligned(browser, 'Left dragbar should align after the reset')
  },

  'Dragging the left dragbar a little below the minimum stops at the minimum #group1': function (browser: NightwatchBrowser) {
    // 260px - 100px = 160px: below the 220px minimum, but not far enough to close
    dragBy(browser, leftDragbar, -100)
    browser.waitForElementVisible('#side-panel', 5000)
    assertPanelWidth(browser, '#side-panel', 220, 'The file explorer can be narrowed to the 220px minimum')
  },

  'Plugins that need more room open the side panel wider, then it goes back to the chosen width #group1': function (browser: NightwatchBrowser) {
    browser.clickLaunchIcon('solidity').pause(1000)
    assertPanelWidth(browser, '#side-panel', 320, 'The compiler opens the side panel at 320px')
    browser.clickLaunchIcon('filePanel').pause(1000)
    assertPanelWidth(browser, '#side-panel', 220, 'The file explorer is back at the width chosen before')
    assertLeftDragbarAligned(browser, 'Left dragbar should align after switching plugins')
  },

  'Dragging the left dragbar far below the minimum closes the side panel #group1': function (browser: NightwatchBrowser) {
    // 220px - 200px = 20px: more than 150px past the minimum
    dragBy(browser, leftDragbar, -200)
    browser.waitForElementNotVisible('#side-panel', 5000)
    browser.doubleClick(leftDragbar).pause(1000)
      .waitForElementVisible('#side-panel', 5000)
    assertPanelWidth(browser, '#side-panel', 260, 'Double-click reopens the side panel at 260px')
  },

  'Right dragbar should align with the pinned panel edge #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .waitForElementVisible('*[data-id="movePluginToRight"]', 5000)
      .click('*[data-id="movePluginToRight"]')
      .waitForElementVisible('#right-side-panel', 5000)
      .moveTo('*[data-right-sidepanel="rightSidepanel-dragbar-draggable"]', 0, 0)
      .waitForElementVisible('*[data-right-sidepanel="rightSidepanel-dragbar-draggable"]', 5000)
      .pause(2000)

    assertRightDragbarAligned(browser, 'Right dragbar should align with the pinned panel edge')
  },

  'Double-clicking the right dragbar resets the pinned panel to its default width #group1': function (browser: NightwatchBrowser) {
    dragBy(browser, rightDragbar, -150)
    browser.doubleClick(rightDragbar).pause(1000)
    // The default 320px is below the pinned panel's 331px minimum
    assertPanelWidth(browser, '#right-side-panel', 331, 'Double-click resets the pinned panel to its 331px minimum')
    assertRightDragbarAligned(browser, 'Right dragbar should align after the reset')
  },

  'Terminal dragbar should align with the terminal edge when shown #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="toggleBottomPanelIcon"]', 5000)
      .click('*[data-id="toggleBottomPanelIcon"]')
      .waitForElementVisible('.terminal-wrap', 5000)
      .waitForElementVisible('.dragbar_terminal', 5000)
      .pause(1000)

    assertTerminalDragbarAligned(browser, 'Terminal dragbar should align with the terminal top edge')
  }
}
