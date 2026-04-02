import React, {
  useState,
  useEffect,
  useRef,
  type SyntheticEvent,
  useContext,
} from 'react';
import RenderCall from './RenderCall';
import RenderKnownTransactions from './RenderKnownTransactions';
import parse from 'html-react-parser';

import { KNOWN_TRANSACTION } from './types';

import './index.css';
import { AppContext } from '../../contexts';

export interface ClipboardEvent<T = Element> extends SyntheticEvent<T, any> {
  clipboardData: DataTransfer;
}

export const TxList = (props: any) => {
  const { appState } = useContext(AppContext);
  const { journalBlocks } = appState.terminal;

  const [showTableHash, setShowTableHash] = useState<any[]>([]);

  const messagesEndRef = useRef<any>(null);
  const typeWriterIndexes = useRef<any>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [journalBlocks.length]);

  const txDetails = (event: any, tx: any) => {
    if (showTableHash.includes(tx.hash)) {
      const index = showTableHash.indexOf(tx.hash);
      if (index > -1) {
        setShowTableHash((prevState) => prevState.filter((x) => x !== tx.hash));
      }
    } else {
      setShowTableHash((prevState) => [...prevState, tx.hash]);
    }
    scrollToBottom();
  };

  const classNameBlock = 'remix_ui_terminal_block px-4 py-1 break-words';

  return (
    <div
      id="journal"
      className="remix_ui_terminal_journal flex flex-col pt-3 pb-4 px-2 ml-2 mr-0 mt-auto"
      data-id="terminalJournal"
    >
      {journalBlocks?.map((x: any, index: number) => {
        if (x.name === KNOWN_TRANSACTION) {
          return x.message.map((trans: any) => {
            return (
              <div
                className={`${classNameBlock} text-danger`}
                data-id={`block_tx${trans.tx.hash}`}
                key={index}
              >
                {trans.tx.isCall ? (
                  <RenderCall
                    tx={trans.tx}
                    resolvedData={trans.resolvedData}
                    logs={trans.logs}
                    index={index}
                    showTableHash={showTableHash}
                    txDetails={txDetails}
                  />
                ) : (
                  <RenderKnownTransactions
                    tx={trans.tx}
                    receipt={trans.receipt}
                    resolvedData={trans.resolvedData}
                    logs={trans.logs}
                    index={index}
                    showTableHash={showTableHash}
                    txDetails={txDetails}
                    provider={x.provider}
                  />
                )}
              </div>
            );
          });
        } else if (Array.isArray(x.message)) {
          return x.message.map((msg: any, i: number) => {
            if (React.isValidElement(msg)) {
              return (
                <div className="px-4 block" data-id="block" key={i}>
                  <span className={x.style}>{msg}</span>
                </div>
              );
            } else if (typeof msg === 'object') {
              if (msg.value && isHtml(msg.value)) {
                return (
                  <div className={classNameBlock} data-id="block" key={i}>
                    <span className={x.style}>{parse(msg.value)} </span>
                  </div>
                );
              }
              let stringified;
              try {
                stringified = JSON.stringify(msg);
              } catch (e) {
                console.error(e);
                stringified = '< value not displayable >';
              }
              return (
                <div className={classNameBlock} data-id="block" key={i}>
                  <span className={x.style}>{stringified} </span>
                </div>
              );
            } else {
              // typeWriterIndexes: we don't want to rerender using typewriter when the react component updates
              if (x.typewriter && !typeWriterIndexes.current.includes(index)) {
                typeWriterIndexes.current.push(index);
                return (
                  <div className={classNameBlock} data-id="block" key={index}>
                    <span
                      ref={(element) => {
                        typewrite(element, msg ? msg.toString() : null, () => {
                          scrollToBottom();
                        });
                      }}
                      className={x.style}
                    ></span>
                  </div>
                );
              } else {
                return (
                  <div className={classNameBlock} data-id="block" key={i}>
                    <span className={x.style}>
                      {msg ? msg.toString() : null}
                    </span>
                  </div>
                );
              }
            }
          });
        } else {
          // typeWriterIndexes: we don't want to rerender using typewriter when the react component updates
          if (x.typewriter && !typeWriterIndexes.current.includes(index)) {
            typeWriterIndexes.current.push(index);
            return (
              <div className={classNameBlock} data-id="block" key={index}>
                {' '}
                <span
                  ref={(element) => {
                    typewrite(element, x.message, () => {
                      scrollToBottom();
                    });
                  }}
                  className={x.style}
                ></span>
              </div>
            );
          } else {
            if (typeof x.message !== 'function') {
              return (
                <div className={classNameBlock} data-id="block" key={index}>
                  {' '}
                  <span className={x.style}> {x.message}</span>
                </div>
              );
            }
            return null;
          }
        }
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};

const typewrite = (elementsRef: any, message: any, callback: any) => {
  (() => {
    let count = 0;
    const id = setInterval(() => {
      if (!elementsRef) return;
      count++;
      elementsRef.innerText = message.substr(0, count);
      // scroll when new line ` <br>
      if (elementsRef.lastChild.tagName === `BR`) callback();
      if (message.length === count) {
        clearInterval(id);
        callback();
      }
    }, 5);
  })();
};

function isHtml(value: any) {
  if (!value.indexOf) return false;
  return (
    value.indexOf('<div') !== -1 ||
    value.indexOf('<span') !== -1 ||
    value.indexOf('<p') !== -1 ||
    value.indexOf('<label') !== -1 ||
    value.indexOf('<b') !== -1
  );
}

export default TxList;
