import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class GoToVmTraceStep extends EventEmitter {
  command (this: NightwatchBrowser, step: number, incr?: number): NightwatchBrowser {
    goToVMtraceStep(this.api, step, incr, () => {
      this.emit('complete')
    })
    return this
  }
}

async function goToVMtraceStep (browser: NightwatchBrowser, step: number, _incr: number, done: VoidFunction) {
  const targetStep = step

  // Wait for the call trace header to be present and give time for any previous navigation to complete
  browser
    .waitForElementPresent('*[data-id="callTraceHeader"]')
    .pause(500) // Ensure header shows current step accurately

  // Try to use the debugger's jumpTo method via window.jumpToDebuggerStep
  // This function is exposed by the debugger-ui component for E2E testing
  browser.execute(function (target) {
    // Use window.jumpToDebuggerStep exposed by debugger-ui for E2E tests
    if (typeof (window as any).jumpToDebuggerStep === 'function') {
      try {
        (window as any).jumpToDebuggerStep(target)
        return { success: true, method: 'window.jumpToDebuggerStep', target }
      } catch (error) {
        return { success: false, error: String(error), target }
      }
    } else {
      return { success: false, error: 'jumpToDebuggerStep not available', target }
    }
  }, [targetStep], (result) => {
    const executeResult = (result as any).value

    // Log result
    if (executeResult.success) {
      console.log(`[goToVMTraceStep] jumpTo(${targetStep}) successful via ${executeResult.method}`)
      // Wait for UI to update and trigger stepChanged event
      browser.pause(1000).perform(() => {
        done()
      })
    } else {
      console.log(`[goToVMTraceStep] jumpTo failed: ${executeResult.error || 'unknown error'}, falling back to button clicks`)
      // Fallback: Click buttons one at a time for smooth editor highlighting

      browser.execute(function (target) {
        const headerText = document.querySelector('[data-id="callTraceHeader"]')?.textContent || ''
        const match = headerText.match(/Step:\s*(\d+)/)
        const currentStep = match ? parseInt(match[1]) : 0

        console.log(`[goToVMTraceStep] Current step from header: ${currentStep}, Target step: ${target}`)

        return {
          currentStep,
          target,
          stepsToGo: target - currentStep
        }
      }, [targetStep], (stepResult) => {
        const stepInfo = (stepResult as any).value
        const stepsToGo = stepInfo.stepsToGo

        console.log(`[goToVMTraceStep] Calculation: ${stepInfo.target} - ${stepInfo.currentStep} = ${stepsToGo} steps to go`)

        if (stepsToGo === 0) {
          console.log(`[goToVMTraceStep] Already at target step ${targetStep}`)
          done()
          return
        }

        const isForward = stepsToGo > 0
        const buttonSelector = isForward ? '[data-id="btnStepInto"]' : '[data-id="btnStepBack"]'
        const totalClicks = Math.abs(stepsToGo)

        console.log(`[goToVMTraceStep] Will click ${totalClicks} times ${isForward ? 'forward' : 'backward'} from step ${stepInfo.currentStep} to reach step ${stepInfo.target}`)

        // Click ONE at a time with a small pause to allow editor to highlight smoothly
        let clicksRemaining = totalClicks

        const clickOne = () => {
          if (clicksRemaining <= 0) {
            browser.pause(500).perform(() => done())
            return
          }

          browser
            .click(buttonSelector)
            .pause(50) // Small pause for smooth editor highlighting
            .perform(() => {
              clicksRemaining--
              clickOne()
            })
        }

        clickOne()
      })
    }
  })
}

module.exports = GoToVmTraceStep
