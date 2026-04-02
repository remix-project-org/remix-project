import React, { useContext, useState } from 'react';
import * as remixLib from '@remix-project/remix-lib';
import { ContractGUI } from '../ContractGUI';
import { TreeView, TreeViewItem } from '@remix-ui/tree-view'
import { BN } from 'bn.js';
import './index.css';
import { AppContext } from '../../contexts';
import { runTransactions } from '../../actions';

const txHelper = remixLib.execution.txHelper;

const getFuncABIInputs = (funABI: any) => {
  if (!funABI.inputs) {
    return '';
  }
  return txHelper.inputParametersDeclarationToString(funABI.inputs);
};

export interface FuncABI {
  name: string;
  type: string;
  inputs: { name: string; type: string }[];
  stateMutability: string;
  payable?: boolean;
  constant?: any;
}

export function UniversalDappUI(props: any) {
  const { appState } = useContext(AppContext);
  const instance = appState.instance;

  const address = instance.address;
  const { abi: contractABI, items, containers } = instance;
  const [expandPath, setExpandPath] = useState<string[]>([]);

  const runTransaction = (
    lookupOnly: boolean,
    funcABI: FuncABI,
    valArr: { name: string; type: string }[] | null,
    inputsValues: string,
    funcIndex?: number
  ) => {
    const functionName =
      funcABI.type === 'function' ? funcABI.name : `(${funcABI.type})`;
    const logMsg = `${lookupOnly ? 'call' : 'transact'} to ${
      instance.name
    }.${functionName}`;

    runTransactions({
      lookupOnly,
      funcABI,
      inputsValues,
      name: instance.name,
      contractABI,
      address,
      logMsg,
      funcIndex,
    });
  };

  const extractDataDefault = (item: any[] | any, parent?: any) => {
    const ret: any = {};

    if (BN.isBN(item)) {
      ret.self = item.toString(10);
      ret.children = [];
    } else {
      if (item instanceof Array) {
        ret.children = item.map((item, index) => {
          return { key: index, value: item };
        });
        ret.self = 'Array';
        ret.isNode = true;
        ret.isLeaf = false;
      } else if (item instanceof Object) {
        ret.children = Object.keys(item).map((key) => {
          return { key, value: item[key] };
        });
        ret.self = 'Object';
        ret.isNode = true;
        ret.isLeaf = false;
      } else {
        ret.self = item;
        ret.children = null;
        ret.isNode = false;
        ret.isLeaf = true;
      }
    }
    return ret;
  };

  const handleExpand = (path: string) => {
    if (expandPath.includes(path)) {
      const filteredPath = expandPath.filter((value) => value !== path);

      setExpandPath(filteredPath);
    } else {
      setExpandPath([...expandPath, path]);
    }
  };

  const label = (key: string | number, value: string) => {
    return (
      <div className="flex mt-2 flex-row label_item">
        <label className="small font-bold mb-0 pr-1 break-words label_key">
          {key}:
        </label>
        <label className="m-0 label_value">{value}</label>
      </div>
    );
  };

  const renderData = (
    item: any[],
    parent: any,
    key: string | number,
    keyPath: string
  ) => {
    const data = extractDataDefault(item, parent);
    const children = (data.children || []).map(
      (child: { value: any[]; key: string }, index: any) => {
        return renderData(
          child.value,
          data,
          child.key,
          keyPath + '/' + child.key
        );
      }
    );

    if (children && children.length > 0) {
      return (
        <TreeViewItem
          id={`treeViewItem${key}`}
          key={keyPath}
          label={label(key, data.self)}
          onClick={() => {
            handleExpand(keyPath);
          }}
          expand={expandPath.includes(keyPath)}
        >
          <TreeView id={`treeView${key}`} key={keyPath}>
            {children}
          </TreeView>
        </TreeViewItem>
      );
    } else {
      return (
        <TreeViewItem
          id={key.toString()}
          key={keyPath}
          label={label(key, data.self)}
          onClick={() => {
            handleExpand(keyPath);
          }}
          expand={expandPath.includes(keyPath)}
        />
      );
    }
  };

  return (
    <div className="row m-0">
      {containers.map((id: any) => {
        return (
          <div className="col-md" key={id}>
            {items[id].map((funcId: any, index: any) => {
              const funcABI = contractABI[funcId];
              if (funcABI.type !== 'function') return null;
              const isConstant =
                    funcABI.constant !== undefined ? funcABI.constant : false;
              const lookupOnly =
                    funcABI.stateMutability === 'view' ||
                    funcABI.stateMutability === 'pure' ||
                    isConstant;
              const inputs = getFuncABIInputs(funcABI);
              return (
                <div
                  className="p-2 bg-light mb-2"
                  data-id={`function${funcId}`}
                  key={funcId}
                >
                  <div className="w-full mb-2">
                    <div>
                      {funcABI.title && <h3 data-id={`functionTitle${funcId}`}>{funcABI.title}</h3>}
                      <ContractGUI
                        funcABI={funcABI}
                        clickCallBack={(
                          valArray: { name: string; type: string }[],
                          inputsValues: string
                        ) => {
                          runTransaction(
                            lookupOnly,
                            funcABI,
                            valArray,
                            inputsValues,
                            funcId
                          );
                        }}
                        inputs={inputs}
                        lookupOnly={lookupOnly}
                        key={funcId}
                      />
                      {funcABI.details && (
                        <div className="pt-2 udapp_intro" data-id={`functionInstructions${funcId}`}>
                          {funcABI.details}
                        </div>
                      )}
                      {lookupOnly && (
                        <div className="udapp_value" data-id="udapp_value">
                          <TreeView id="treeView">
                            {Object.keys(
                              instance.decodedResponse || {}
                            ).map((key) => {
                              const funcIndex = funcId;
                              const response =
                                    instance.decodedResponse[key];

                              return key === funcIndex
                                ? Object.keys(response || {}).map(
                                  (innerkey, _index) => {
                                    return renderData(
                                      instance.decodedResponse[key][
                                        innerkey
                                      ],
                                      response,
                                      innerkey,
                                      innerkey
                                    );
                                  }
                                )
                                : null;
                            })}
                          </TreeView>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
