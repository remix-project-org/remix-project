import { fileStatusResult, sourceControlGroup } from "../../../types";
import React from "react";
import path from "path";
import { gitActionsContext, pluginActionsContext } from "../../../state/context";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { SourceControlItemButtons } from "./sourcontrolitembuttons";
import { removeSlash } from "../../../utils";
import { commitChange } from "@remix-api";

export interface SourceControlItemProps {
  file: fileStatusResult;
  group: sourceControlGroup;
}

export const SourceControlItem = (props: SourceControlItemProps) => {
  const { file, group } = props;
  const actions = React.useContext(gitActionsContext)
  const pluginActions = React.useContext(pluginActionsContext)

  async function fileClick(file: fileStatusResult) {
    if (file.statusNames && file.statusNames.indexOf("modified") !== -1) {
      const headHash = await actions.resolveRef("HEAD")
      const change: commitChange = {
        path: removeSlash(file.filename),
        type: "modified",
        hashOriginal: headHash,
        hashModified: '',
        readonly: false,
      }
      await actions.diff(change)
      await pluginActions.openDiff(change)
    } else {
      await pluginActions.openFile(file.filename)
      //await client.call('fileManager', 'open', file.filename)
    }
  }

  function FunctionStatusIcons() {

    const status = file.statusNames

    return (<>

      {status && status.indexOf("modified") === -1 ? <></> : <span className="pl-2">M</span>}
      {status && status.indexOf("deleted") === -1 ? <></> : <span className="pl-2">D</span>}
      {status && status.indexOf("added") === -1 ? <></> : <span className="pl-2">A</span>}
      {status && status.indexOf("untracked") === -1 ? <></> : <span className="pl-2">U</span>}
    </>)
  }

  if (!file.statusNames || file.statusNames.length === 0) return null

  return (<>
    <div data-status={file.statusNames.join('-')} data-file={file.filename} className="flex w-full flex flex-row items-center mt-2">
      <div className='pointer gitfile long-and-truncated' onClick={async () => await fileClick(file)}>
        <span className='font-bold long-and-truncated'>{path.basename(file.filename)}</span>
        <div className='text-secondary long-and-truncated'> {file.filename}</div>
      </div>
      <div className="flex items-center ml-1 px-2">
        <SourceControlItemButtons group={group} file={file}></SourceControlItemButtons>
        <FunctionStatusIcons></FunctionStatusIcons>
      </div>
    </div>
  </>)
}
