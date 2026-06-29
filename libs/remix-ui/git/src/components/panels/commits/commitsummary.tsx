import { ReadCommitResult } from "isomorphic-git"
import { default as dateFormat } from "dateformat";
import React from "react";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { branch, remote } from "@remix-ui/git";
import GitUIButton from "../../buttons/gituibutton";
import { gitPluginContext } from "../../gitui";
import { removeGitFromUrl } from "../../../utils";
import { useIntl } from "react-intl";

export interface CommitSummaryProps {
  commit: ReadCommitResult;
  checkout: (oid: string) => void;
  isAheadOfRepo: boolean
  branch: branch
}

export const CommitSummary = (props: CommitSummaryProps) => {
  const { commit, checkout, isAheadOfRepo, branch } = props;
  const context = React.useContext(gitPluginContext)
  const intl = useIntl()

  const getDate = (commit: ReadCommitResult) => {
    const timestamp = commit.commit.author.timestamp;

    if (timestamp) {
      // calculate the difference between the current time and the commit time in days or hours or minutes
      const diff = Math.floor((Date.now() - timestamp * 1000) / 1000 / 60 / 60 / 24);

      if (diff == 0) {
        return "today at " + dateFormat(timestamp * 1000, "HH:MM");
      } else

      if (diff < 1) {
        // return how many hours ago
        return `${Math.floor(diff * 24)} hour(s) ago`;
      }

      if (diff < 7) {
        // return how many days ago
        return `${diff} day(s) ago`;
      }
      if (diff < 365) {
        return dateFormat(timestamp * 1000, "mmm dd");
      }
      return dateFormat(timestamp * 1000, "mmm dd yyyy");
    }
    return "";
  };

  const getRemote = (): remote | null => {
    return branch.remote? branch.remote: context.upstream ? context.upstream : context.defaultRemote ? context.defaultRemote : null
  }

  const openRemote = () => {
    if (getRemote())
      window.open(`${removeGitFromUrl(getRemote().url)}/commit/${commit.oid}`, '_blank');
  }
  function removeLineBreaks(str: string): string {
    return str.replace(/(\r\n|\n|\r)/gm, '');
  }

  return (
    <>
      <div data-type='commit-summary' data-id={`commit-summary-${removeLineBreaks(commit.commit.message)}-${isAheadOfRepo ? 'ahead' : ''}`} className="long-and-truncated ms-2">
        {commit.commit.message}
      </div>
      {commit.commit.author.name || ""}
      <span className="ms-1">{getDate(commit)}</span>
      {getRemote() && getRemote()?.url && !isAheadOfRepo && <GitUIButton tooltip={intl.formatMessage({ id: 'gitui.openOnRemote' })} className="btn btn-sm p-0 text-muted ms-1" onClick={() => openRemote()}><FontAwesomeIcon icon={faGlobe} ></FontAwesomeIcon></GitUIButton>}
    </>
  )
}