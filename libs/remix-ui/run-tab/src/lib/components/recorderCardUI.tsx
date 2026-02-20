// eslint-disable-next-line no-use-before-define
import React, { useRef, useState, useEffect } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { RecorderProps } from '../types'
import { CustomTooltip } from '@remix-ui/helper'

export function RecorderUI(props: RecorderProps) {
  const inputLive = useRef<HTMLInputElement>()
  const [toggleExpander, setToggleExpander] = useState<boolean>(false)
  const [enableRunButton, setEnableRunButton] = useState<boolean>(true)
  const intl = useIntl()

  const triggerRecordButton = () => {
    props.storeScenario(props.scenarioPrompt)
  }

  const handleClickRunButton = () => {
    const liveMode = inputLive.current ? inputLive.current.checked : false
    props.runCurrentScenario(liveMode)
  }

  useEffect(() => {
    if (props.currentFile && props.currentFile.endsWith('.json')) setEnableRunButton(true)
    else setEnableRunButton(false)
  }, [props.currentFile])

  const toggleClass = () => {
    setToggleExpander(!toggleExpander)
  }

  const startWalkthrough = async () => {
    setToggleExpander(true)
    await props.plugin.call('walkthrough', 'startRecorderW')
  }

  return (
    <div className="udapp_cardContainer py-1 list-group-item border-top border-bottom bg-dark" id="udappRecorderCard">
      <div className="udapp_recorderSection d-flex justify-content-between">
        <div className="d-flex justify-content-center align-items-center">
          <label className="text-nowrap udapp_recorderSectionLabel" onClick={toggleClass}>
            <FormattedMessage id="udapp.transactionsRecorded" />
          </label>
          <CustomTooltip
            placement={'auto-end'}
            tooltipClasses="text-nowrap"
            tooltipId="recordedTransactionsCounttooltip"
            tooltipText={<FormattedMessage id="udapp.transactionsCountTooltip" />}
          >
            <div className="ms-2 badge rounded-pill text-bg-primary text-center" style={{ cursor:"default" }} data-bs-title="The number of recorded transactions">
              {props.count}
            </div>
          </CustomTooltip>
          <CustomTooltip
            placement={'auto-end'}
            tooltipClasses="text-nowrap"
            tooltipId="recordedTransactionsWalkthroughtooltip"
            tooltipText={<FormattedMessage id="udapp.transactionsWalkthroughTooltip" />}
          >
            <i
              className={'ms-2 fas fa-info align-self-center'}
              aria-hidden="true"
              onClick={() => startWalkthrough()}
              data-id="recorderStartWalkthrough"
            >
            </i>
          </CustomTooltip>
        </div>
        <div className="w-100" onClick={toggleClass}></div>
        <div className="p-3">
          <span data-id="udappRecorderTitleExpander" onClick={toggleClass}>
            <i className={!toggleExpander ? 'fas fa-angle-right' : 'fas fa-angle-down'} aria-hidden="true"></i>
          </span>
        </div>
      </div>
      { toggleExpander && <div className={`pb-2 flex-column d-flex`} data-id='remixRecorderExpanded'>
        <div className="mb-1 mt-1 form-check mb-1" id='udappRecorderUseLatest'>
          <input ref={inputLive} type="checkbox" id="livemode-recorder" className="form-check-input" name="input-livemode" />
          <CustomTooltip
            placement={'auto-end'}
            tooltipClasses="text-wrap"
            tooltipId="tooltip-livemode-recorder"
            tooltipText={
              <span>
                <FormattedMessage id="udapp.livemodeRecorderTooltip" values={{ br: <br /> }} />
              </span>
            }
          >
            <label className="form-check-label" data-id="runtabLivemodeInput" htmlFor="livemode-recorder">
              <FormattedMessage id="udapp.livemodeRecorderLabel" />
            </label>
          </CustomTooltip>
        </div>
        <div className="mb-1 mt-1 udapp_transactionActions">
          <CustomTooltip
            placement={'bottom-start'}
            tooltipClasses="text-nowrap"
            tooltipId="remixUdappTransactionSavetooltip"
            tooltipText={
              props.count === 0
                ? intl.formatMessage({ id: 'udapp.transactionSaveTooltip1' })
                : props.count === 1
                  ? intl.formatMessage({ id: 'udapp.transactionSaveTooltip2' }, { count: props.count })
                  : intl.formatMessage({ id: 'udapp.transactionSaveTooltip3' }, { count: props.count })
            }
          >
            <button
              className="btn btn-sm btn-secondary savetransaction udapp_recorder"
              disabled={props.count === 0 ? true : false}
              onClick={triggerRecordButton}
              style={{ pointerEvents: props.count === 0 ? 'none' : 'auto' }}
              id="udappRecorderSave"
            >
              <FormattedMessage id="udapp.save" />
            </button>
          </CustomTooltip>
          <CustomTooltip placement={'right'} tooltipClasses="text-nowrap" tooltipId="tooltip-run-recorder" tooltipText={<FormattedMessage id="udapp.runRecorderTooltip" />}>
            <button
              className={enableRunButton ? "btn btn-sm btn-secondary runtransaction udapp_runTxs" : "btn btn-sm btn-secondary runtransaction udapp_runTxs"}
              data-id="runtransaction"
              disabled={!enableRunButton}
              onClick={handleClickRunButton}
              style={{ pointerEvents: !enableRunButton ? 'none' : 'auto' }}
              id="udappRecorderRun"
            >
              <FormattedMessage id="udapp.run" />
            </button>
          </CustomTooltip>
        </div>
      </div>}
    </div>
  )
}
