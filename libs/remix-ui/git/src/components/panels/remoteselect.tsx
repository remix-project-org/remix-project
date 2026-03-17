import React, { useEffect, useState } from "react";
import { gitActionsContext } from "../../state/context";
import { gitPluginContext } from "../gitui";
import { default as dateFormat } from "dateformat";
import { RemotesDetailsNavigation } from "../navigation/remotesdetails";
import { Accordion } from "react-bootstrap";
import { remote } from "@remix-api";
import { RemoteBranchDetails } from "./branches/remotebranchedetails";
import GitUIButton from "../buttons/gituibutton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSync } from "@fortawesome/free-solid-svg-icons";
import { branch } from "@remix-api";
import { FormattedMessage } from "react-intl";

export interface RemoteSelectProps {
  remote: remote
  openDefault: boolean
}

const pageLength = 5;

export const Remoteselect = (props: RemoteSelectProps) => {
  const { remote, openDefault } = props;
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)
  const [activePanel, setActivePanel] = useState<string>("");
  const [remoteBranchPage, setRemoteBranchPage] = useState(1);
  const [remoteBranches, setRemoteBranches] = useState<branch[]>([]);

  useEffect(() => {
    setActivePanel(openDefault ? "0" : "")
  }, [openDefault])

  useEffect(() => {
    if (context.branches) {
      if (remote && remote.name) {
        setRemoteBranches(context.branches.filter((branch, index) => branch.remote && branch.remote.name === remote.name))
      } else {
        setRemoteBranches([]);
      }
    } else {
      setRemoteBranches([]);
    }
  }, [context.branches, context.defaultRemote, context.upstream, remote]);

  return (
    <>
      <Accordion activeKey={activePanel} defaultActiveKey=''>
        <RemotesDetailsNavigation callback={setActivePanel} eventKey="0" activePanel={activePanel} remote={remote} />
        <Accordion.Collapse className="ps-2 border-start ms-1" eventKey="0">
          <>
            {context.branches && remoteBranches
              .slice(0, remoteBranchPage * pageLength)
              .map((branch, index) => {
                return (
                  <RemoteBranchDetails allowCheckout={false} key={index} branch={branch}></RemoteBranchDetails>
                );
              })}
            {context.branches && remoteBranches.length > remoteBranchPage * pageLength && <><GitUIButton className="btn btn-sm" onClick={() => {
              setRemoteBranchPage(remoteBranchPage + 1);
            }}><FormattedMessage id="gitui.showMore" /></GitUIButton><br></br></>}
            <GitUIButton data-id={`remote-sync-${remote.name}`} className="btn btn-sm" onClick={async () => {
              await actions.fetch({
                remote
              })
            }}><FontAwesomeIcon icon={faSync} ></FontAwesomeIcon><label className="ps-1"><FormattedMessage id="gitui.fetchMoreFromRemote" /></label></GitUIButton>
          </>

        </Accordion.Collapse>
      </Accordion>
    </>
  )
}
