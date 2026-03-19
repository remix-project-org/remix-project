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
      .pause()
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
