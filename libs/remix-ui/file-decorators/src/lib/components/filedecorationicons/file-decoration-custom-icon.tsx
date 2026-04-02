// eslint-disable-next-line no-use-before-define
import React from 'react'
import { fileDecoration } from '../../types'

const FileDecorationCustomIcon = (props: {fileDecoration: fileDecoration}) => {
  return (
    <>
      <span data-id={`file-decoration-custom-${props.fileDecoration.path}`} className={`${props.fileDecoration.fileStateIconClass} pr-2`}>
        <>{props.fileDecoration.fileStateIcon}</>
      </span>
    </>
  )
}

export default FileDecorationCustomIcon
