import React, {useState, useEffect} from 'react' // eslint-disable-line
import Slider from '../slider/slider' // eslint-disable-line
import ButtonNavigator from '../button-navigator/button-navigator' // eslint-disable-line

export const StepManager = ({
  stepManager: {
    jumpTo,
    traceLength,
    stepIntoBack,
    stepIntoForward,
    stepOverBack,
    stepOverForward,
    jumpOut,
    jumpNextBreakpoint,
    jumpPreviousBreakpoint,
    jumpToException,
    registerEvent,
    showOpcodes
  }
}) => {
  const [state, setState] = useState({
    sliderValue: -1,
    revertWarning: '',
    stepState: '',
    jumpOutDisabled: true
  })

  useEffect(() => {
    registerEvent && registerEvent('revertWarning', setRevertWarning)
    registerEvent && registerEvent('stepChanged', updateStep)
  }, [registerEvent])

  const setRevertWarning = (warning) => {
    setState((prevState) => {
      return { ...prevState, revertWarning: warning }
    })
  }

  const updateStep = (step, stepState, jumpOutDisabled) => {
    setState((prevState) => {
      return { ...prevState, sliderValue: step, stepState, jumpOutDisabled }
    })
  }
  const { sliderValue, revertWarning, stepState, jumpOutDisabled } = state

  return (
    <div className="py-1">
      <Slider jumpTo={jumpTo} sliderValue={sliderValue} traceLength={traceLength} />
      <ButtonNavigator
        stepIntoBack={stepIntoBack}
        stepIntoForward={stepIntoForward}
        stepOverBack={stepOverBack}
        stepOverForward={stepOverForward}
        revertedReason={revertWarning}
        stepState={stepState}
        jumpOutDisabled={jumpOutDisabled}
        jumpOut={jumpOut}
        jumpNextBreakpoint={jumpNextBreakpoint}
        jumpPreviousBreakpoint={jumpPreviousBreakpoint}
        jumpToException={jumpToException}
        showOpcodes={showOpcodes}
      />
    </div>
  )
}

export default StepManager
