import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class HideToolTips extends EventEmitter {
  command(this: NightwatchBrowser): NightwatchBrowser {
    const browser = this.api
    browser
      .execute(function () {
        // Set global flag to disable all CustomTooltip components
        ;(window as any).REMIX_DISABLE_TOOLTIPS = true
        // Tell the nudge plugin's render() to return <></> so the backdrop is never mounted
        ;(window as any).__IS_E2E_TEST__ = true

        // Dispatch custom event to notify all CustomTooltip components
        const event = new CustomEvent('remix-tooltip-toggle', {
          detail: { disabled: true }
        })
        window.dispatchEvent(event)

        // Hide tooltips, popovers, and nudge modals via CSS
        const style = document.createElement('style')
        style.id = 'nightwatch-disable-tooltips'
        style.textContent = `
          .tooltip,
          .popover,
          [role="tooltip"],
          [id*="Tooltip"],
          [id*="tooltip"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
          #nudge-widget-container,
          .nudge-widget,
          .nudge-modal-backdrop,
          .nudge-decoration {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
        `
        const existing = document.getElementById('nightwatch-disable-tooltips')
        if (existing) existing.remove()
        document.head.appendChild(style)

        // Remove any existing tooltips and nudge nodes from DOM
        document.querySelectorAll('.tooltip, .popover, [role="tooltip"], .nudge-modal-backdrop, .nudge-widget').forEach(el => {
          try { el.remove() } catch (e) {}
        })
      }, [])
      .pause(100)
      .perform(() => {
        this.emit('complete')
      })
    
    return browser
  }
}

module.exports = HideToolTips
