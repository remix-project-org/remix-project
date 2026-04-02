import { faCaretUp, faCaretDown, faCaretRight, faArrowUp, faArrowDown, faArrowRotateRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useContext, useEffect } from "react";
import { CommitSummary } from "../panels/commits/commitsummary";
import { ReadCommitResult } from "isomorphic-git"
import { branch } from "@remix-api";

interface CommitDetailsNavigationProps {
  commit: ReadCommitResult,
  checkout: (oid: string) => void
  eventKey: string
  activePanel: string
  callback: (eventKey: string) => void
  isAheadOfRepo: boolean
  branch: branch
}

export const CommitDetailsNavigation = (props: CommitDetailsNavigationProps) => {
  const { commit, checkout, eventKey, activePanel, callback, isAheadOfRepo, branch } = props;
  const handleClick = () => {
    if (!callback) return
    if (activePanel === eventKey) {
      callback('')
    } else {
      callback(eventKey)
    }
  }
  return (
    <>
      <div onClick={() => handleClick()} role={'button'} className={`pointer mb-2 mt-2 w-full flex flex-row commit-navigation ${isAheadOfRepo ? 'text-success' : ''}`}>
        {
          activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
        }

        <CommitSummary branch={branch} isAheadOfRepo={isAheadOfRepo} commit={commit} checkout={checkout}></CommitSummary>
      </div>
    </>
  );
}