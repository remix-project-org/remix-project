import { Template, TemplateGroup } from '@remix-ui/workspace'
import { ModalState } from '../interface'
import { defaultFocusTemplateExplorer } from '../context/provider'

export const ModalInitialState: ModalState = {
  modals: [],
  toasters: [],
  focusModal: {
    id: '',
    hide: true,
    title: '',
    message: '',
    validationFn: () => { return { valid: true, message: '' } },
    okLabel: '',
    okFn: () => { },
    cancelLabel: '',
    cancelFn: () => { },
    showCancelIcon: false
  },
  focusToaster: { message: '', timestamp: 0 },
  focusTemplateExplorer: {
    id: '',
    hide: true,
    validationFn: () => { return { valid: true, message: '' } },
    okLabel: '',
    okFn: () => { },
    cancelLabel: '',
    cancelFn: () => { },
    showModal: false,
    showCancelIcon: false,
    preventBlur: false,
    placeholderText: '',
    genericData: {}
  }
}
