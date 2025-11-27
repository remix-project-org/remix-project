import { AppModal, GenericModal } from '../interface'

type ActionMap<M extends { [index: string]: any }> = {
    [Key in keyof M]: M[Key] extends undefined
      ? {
          type: Key;
        }
      : {
          type: Key;
          payload: M[Key];
        }
}

export const enum modalActionTypes {
  setModal = 'SET_MODAL',
  setToast = 'SET_TOAST',
  processQueue = 'PROCESS_QUEUEU',
  handleHideModal = 'HANDLE_HIDE_MODAL',
  handleToaster = 'HANDLE_HIDE_TOAST',
  setTemplateExplorer = 'SET_TEMPLATE_EXPLORER'
}

type ModalPayload = {
  [modalActionTypes.setModal]: AppModal
  [modalActionTypes.handleHideModal]: any
  [modalActionTypes.setToast]: { message: string | JSX.Element, timestamp: number }
  [modalActionTypes.handleToaster]: any,
  [modalActionTypes.processQueue]: any,
  [modalActionTypes.setTemplateExplorer]: GenericModal
}

export type ModalAction = ActionMap<ModalPayload>[keyof ActionMap<
  ModalPayload
>]
