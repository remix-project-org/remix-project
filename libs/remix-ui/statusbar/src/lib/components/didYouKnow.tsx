import { CustomTooltip } from '@remix-ui/helper'
import axios from 'axios'
import React, { useEffect, useState } from 'react'
import { FormattedMessage } from 'react-intl'

export default function DidYouKnow () {
  const [tip, setTip] = useState<string>('')
  useEffect(() => {
    const abortController = new AbortController()
    const signal = abortController.signal
    async function showRemixTips() {
      const response = await axios.get('https://raw.githubusercontent.com/remix-project-org/remix-dynamics/main/ide/tips.json', { signal })
      if (signal.aborted) return
      const tips = response.data
      const index = Math.floor(Math.random() * (tips.length - 1))
      setTip(tips[index])
    }
    try {
      showRemixTips()
    } catch (e) {
      console.log(e)
    }
    return () => {
      abortController.abort()
    }
  }, [])
  return (
    <CustomTooltip tooltipText={tip}>
      <div className="remixui_statusbar_didyouknow text-white small d-flex align-items-center">
        <span className="pe-2 text-success fa-solid fa-lightbulb"></span>
        <div className="me-2" style={{ fontWeight: "bold" }}><FormattedMessage id="statusbar.didYouKnow" /></div>
        { tip && tip.length > 0 ? <div>{tip}</div> : null }
      </div>
    </CustomTooltip>
  )
}
