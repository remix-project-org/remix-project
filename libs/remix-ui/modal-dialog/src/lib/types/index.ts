import { AppModalCancelTypes } from "@remix-ui/app"

export type ValidationResult = {
  valid: boolean,
  message?: string
}

/* eslint-disable no-undef */
export interface ModalDialogProps {
  id: string
  timestamp?: number,
  title?: string | JSX.Element,
  validation?: ValidationResult
  validationFn?: (value: any) => ValidationResult
  message?: string | JSX.Element,
  okLabel?: string | JSX.Element,
  okFn?: (value?:any) => void,
  donotHideOnOkClick?: boolean,
  cancelLabel?: string | JSX.Element,
  cancelFn?: (reason?: AppModalCancelTypes) => void,
  modalClass?: string,
  modalParentClass?: string
  showCancelIcon?: boolean,
  hide?: boolean,
  handleHide: (hideState?: boolean) => void,
  children?: React.ReactNode,
  resolve?: (value?:any) => void,
  next?: () => void,
  data?: any,
  okBtnClass?: string,
  cancelBtnClass?: string,
  preventBlur?: boolean
  placeholderText?: string
  genericData?: any
}
