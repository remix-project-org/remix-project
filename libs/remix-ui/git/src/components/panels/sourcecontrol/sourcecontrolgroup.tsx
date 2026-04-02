import { ReadCommitResult } from "isomorphic-git"
import React, { useEffect, useState } from "react";
import { Accordion } from "react-bootstrap";
import { gitActionsContext } from "../../../state/context";
import { gitPluginContext } from "../../gitui";
import { sourceControlGroup } from "../../../types";
import { SourceControlGroupNavigation } from "../../navigation/sourcecontrolgroup";
import { SourceControlItem } from "./sourcecontrolitem";

export interface SourceControGroupProps {
  group: sourceControlGroup
}

export const SourceControGroup = (props: SourceControGroupProps) => {
  const { group } = props;
  const actions = React.useContext(gitActionsContext)
  const context = React.useContext(gitPluginContext)
  const [activePanel, setActivePanel] = useState<string>("0");

  useEffect(() => {
    if (activePanel === "0") {
    }
  }, [activePanel])

  return (<>
    {group.group.length > 0 ?
      <Accordion activeKey={activePanel} defaultActiveKey="">
        <SourceControlGroupNavigation group={group} eventKey="0" activePanel={activePanel} callback={setActivePanel} />
        <Accordion.Collapse className="pl-2 border-l ml-1" eventKey="0">
          <>
            {group.group.map((file, index) => {
              return (<SourceControlItem key={index} group={group} file={file}></SourceControlItem>)
            })}
          </>
        </Accordion.Collapse>
      </Accordion> : <></>}
  </>)
}
