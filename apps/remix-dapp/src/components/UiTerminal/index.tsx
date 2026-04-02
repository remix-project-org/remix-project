import React, {
  useState,
  useEffect,
  useRef,
  type SyntheticEvent,
  useContext,
} from 'react';
import { FormattedMessage } from 'react-intl';
// import { CommentCount, DiscussionEmbed } from 'disqus-react';
import { CustomTooltip } from '@remix-ui/helper';
import TxList from './TxList';

import './index.css';
import { AppContext } from '../../contexts';

export interface ClipboardEvent<T = Element> extends SyntheticEvent<T, any> {
  clipboardData: DataTransfer;
}

export const RemixUiTerminal = (props: any) => {
  const { appState, dispatch } = useContext(AppContext);
  const { journalBlocks, height, hidden } = appState.terminal;

  const [display, setDisplay] = useState('transaction');

  const messagesEndRef = useRef<any>(null);
  const typeWriterIndexes = useRef<any>([]);

  // terminal draggable
  const panelRef = useRef(null);
  const terminalMenu = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [journalBlocks.length]);

  const handleClearConsole = () => {
    typeWriterIndexes.current = [];
    dispatch({ type: 'SET_TERMINAL', payload: { journalBlocks: [] } });
  };
  /* start of autoComplete */

  const handleToggleTerminal = () => {
    dispatch({
      type: 'SET_TERMINAL',
      payload: { hidden: !hidden, height: hidden ? 250 : 35 },
    });
  };

  return (
    <div className="fixed-bottom" style={{ height }}>
      <div
        id="terminal-view"
        className="h-full flex"
        data-id="terminalContainer-view"
      >
        <div
          style={{ fontSize: 12 }}
          className="flex relative flex-col flex-grow-1"
          ref={panelRef}
        >
          <div className="z-2 flex">
            <div
              className="flex w-full items-center relative border-t border-dark bg-light"
              ref={terminalMenu}
              style={{ height: 35 }}
              data-id="terminalToggleMenu"
            >
              <CustomTooltip
                placement="top"
                tooltipId="terminalToggle"
                tooltipClasses="whitespace-nowrap"
                tooltipText={
                  !hidden ? (
                    <FormattedMessage id="terminal.hideTerminal" />
                  ) : (
                    <FormattedMessage id="terminal.showTerminal" />
                  )
                }
              >
                <i
                  className={`mx-2 remix_ui_terminal_toggleTerminal fas ${
                    !hidden ? 'fa-angle-double-down' : 'fa-angle-double-up'
                  }`}
                  data-id="terminalToggleIcon"
                  onClick={handleToggleTerminal}
                ></i>
              </CustomTooltip>
              <div
                className="mx-2 remix_ui_terminal_toggleTerminal"
                role="button"
                id="clearConsole"
                data-id="terminalClearConsole"
                onClick={handleClearConsole}
              >
                <CustomTooltip
                  placement="top"
                  tooltipId="terminalClear"
                  tooltipClasses="whitespace-nowrap"
                  tooltipText={<FormattedMessage id="terminal.clearConsole" />}
                >
                  <i className="fas fa-ban" aria-hidden="true"></i>
                </CustomTooltip>
              </div>
              {/* <div
                className="pl-2 remix_ui_terminal_toggleTerminal"
                onClick={() => {
                  setDisplay('transaction');
                }}
              >
                {
                  journalBlocks.filter(
                    (item: any) => item.name === 'knownTransaction'
                  ).length
                }{' '}
                Transactions
              </div>
              {shortname && (
                <div
                  className="pl-3 remix_ui_terminal_toggleTerminal"
                  onClick={() => {
                    setDisplay('comment');
                  }}
                >
                  <CommentCount
                    shortname={shortname}
                    config={{
                      url: window.origin,
                      identifier: `${address}|${document.domain}`,
                      title: name,
                    }}
                  >
                    Comments
                  </CommentCount>
                </div>
              )} */}
            </div>
          </div>
          <div
            tabIndex={-1}
            className="remix_ui_terminal_container flex h-full m-0 flex-col"
            data-id="terminalContainer"
          >
            <div
              className={`relative flex-col-reverse h-full ${
                display === 'transaction' ? 'flex' : 'hidden'
              }`}
            >
              <TxList />
            </div>
            {/* {shortname && (
              <div className={`p-3 ${display === 'comment' ? '' : 'hidden'}`}>
                <DiscussionEmbed
                  shortname={shortname}
                  config={{
                    url: window.origin,
                    identifier: `${address}|${document.domain}`,
                    title: name,
                  }}
                />
              </div>
            )} */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RemixUiTerminal;
