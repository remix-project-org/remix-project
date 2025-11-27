import { modalActionTypes, ModalAction } from '../actions/modals'
import { ModalInitialState } from '../state/modals'
import { AppModal, ModalState } from '../interface'

export const modalReducer = (state: ModalState = ModalInitialState, action: ModalAction) => {
  switch (action.type) {
  case modalActionTypes.setModal: {
    const timestamp = Date.now()
    const focusModal: AppModal = {
      timestamp,
      id: action.payload.id || timestamp.toString(),
      hide: false,
      title: action.payload.title,
      validationFn: action.payload.validationFn,
      message: action.payload.message,
      okLabel: action.payload.okLabel,
      okFn: action.payload.okFn,
      cancelLabel: action.payload.cancelLabel,
      cancelFn: action.payload.cancelFn,
      modalType: action.payload.modalType,
      modalParentClass: action.payload.modalParentClass,
      defaultValue: action.payload.defaultValue,
      hideFn: action.payload.hideFn,
      resolve: action.payload.resolve,
      next: action.payload.next,
      data: action.payload.data,
      showCancelIcon: action.payload.showCancelIcon,
      preventBlur: action.payload.preventBlur,
      placeholderText: action.payload.placeholderText
    }

    const modalList: AppModal[] = state.modals.slice()
    modalList.push(focusModal)

    if (modalList.length === 1) {
      return { ...state, modals: modalList, focusModal }
    } else {
      return { ...state, modals: modalList }
    }
  }
  case modalActionTypes.handleHideModal: {
    setTimeout(() => {
      if (state.focusModal.hideFn) {
        state.focusModal.hideFn()
      }
      if (state.focusModal.resolve) {
        state.focusModal.resolve(undefined)
      }
      if (state.focusModal.next) {
        state.focusModal.next()
      }
    }, 250)
    const modalList: AppModal[] = state.modals.slice()
    modalList.shift() // remove the current modal from the list
    state.focusModal = { ...state.focusModal, hide: true, message: null }
    return { ...state, modals: modalList }
  }
  case modalActionTypes.processQueue: {
    const modalList: AppModal[] = state.modals.slice()
    if (modalList.length) {
      const focusModal = modalList[0] // extract the next modal from the list
      return { ...state, modals: modalList, focusModal }
    } else {
      return { ...state, modals: modalList }
    }
  }
  case modalActionTypes.setToast: {
    const toasterList = state.toasters.slice()
    toasterList.push(action.payload)
    if (toasterList.length === 1) {
      return { ...state, toasters: toasterList, focusToaster: action.payload }
    } else {
      return { ...state, toasters: toasterList }
    }
  }
  case modalActionTypes.handleToaster: {
    const toasterList = state.toasters.slice()
    toasterList.shift()
    if (toasterList.length) {
      const toaster = toasterList[0]
      return { ...state, toasters: toasterList, focusToaster: toaster }
    } else {
      return { ...state, toasters: []}
    }
  }

  case modalActionTypes.setTemplateExplorer: {
    return { ...state, focusTemplateExplorer: action.payload }
  }
  }
}
