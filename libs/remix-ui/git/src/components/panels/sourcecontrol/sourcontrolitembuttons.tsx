import { fileStatusResult, sourceControlGroup } from "../../../types";
import React from "react";
import path from "path";
import { gitActionsContext, pluginActionsContext } from "../../../state/context";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe, faMinus, faPlus, faUndo } from "@fortawesome/free-solid-svg-icons";

export interface SourceControlItemButtonsProps {
  file: fileStatusResult,
  group: sourceControlGroup
}

export const SourceControlItemButtons = (props: SourceControlItemButtonsProps) => {
  const { file, group } = props;
  const actions = React.useContext(gitActionsContext)
  const pluginActions = React.useContext(pluginActionsContext)

  function RenderButtons() {
    const status = file.statusNames

    if (group.name === 'Staged') {
      return <>

        {status && status.indexOf("modified") === -1 ? <></> :
          <button
            data-id={`unDo${group.name}${path.basename(file.filename)}`}
            onClick={async () => await actions.checkoutfile(file.filename)} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-secondary mr-1 '>
            <FontAwesomeIcon icon={faUndo} className="" /></button>
        }
        {status && status.indexOf("deleted") === -1 ? <></> :
          <button
            data-id={`unDo${group.name}${path.basename(file.filename)}`}
            onClick={async () => {
              await actions.checkoutfile(file.filename)
              await actions.add({ filepath: file.filename })
            }} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-secondary mr-1 '>
            <FontAwesomeIcon icon={faUndo} className="" /></button>
        }
        {status && status.indexOf("deleted") !== -1 ? <></> :
          <button data-id={`unStage${group.name}${path.basename(file.filename)}`}
            onClick={async () => await actions.rm({ filepath: file.filename })} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-secondary mr-1 '>
            <FontAwesomeIcon icon={faMinus} className="" /></button>
        }

      </>
    }
    if (group.name === 'Changes') {
      return <>

        {status && status.indexOf("deleted") === -1 ? <></> :
          <><button onClick={async () => await actions.checkoutfile(file.filename)} data-id={`undo${group.name}${path.basename(file.filename)}`} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-secondary mr-1 '>
            <FontAwesomeIcon icon={faUndo} className="" />
          </button><button data-id={`addToGit${group.name}${path.basename(file.filename)}`} onClick={async () => await actions.rm({ filepath: file.filename })} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-secondary mr-1 '>
            <FontAwesomeIcon icon={faPlus} className="" /></button></>
        }
        {status && status.indexOf("modified") === -1 ? <></> :
          <button onClick={async () => await actions.checkoutfile(file.filename)} data-id={`undo${group.name}${path.basename(file.filename)}`} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-secondary mr-1 '>
            <FontAwesomeIcon icon={faUndo} className="" /></button>
        }
        {(status && status.indexOf("unstaged") !== -1 || status && status.indexOf("deleted") !== -1) ? <></> :
          <button data-id={`addToGit${group.name}${path.basename(file.filename)}`} onClick={async () => await actions.add({ filepath: file.filename })} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-secondary mr-1 '>
            <FontAwesomeIcon icon={faPlus} className="" /></button>
        }
        {(status && status.indexOf("unstaged") !== -1 && status && status.indexOf("modified") !== -1) ?
          <button data-id={`addToGit${group.name}${path.basename(file.filename)}`} onClick={async () => await actions.add({ filepath: file.filename })} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-secondary mr-1 '>
            <FontAwesomeIcon icon={faPlus} className="" /></button> :
          <></>
        }
      </>
    }
    return <></>
  }

  return <RenderButtons />

}