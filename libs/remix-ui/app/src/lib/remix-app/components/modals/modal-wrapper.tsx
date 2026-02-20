import React, { useEffect, useRef, useState } from 'react'
import { ModalDialog, ModalDialogProps, ValidationResult } from '@remix-ui/modal-dialog'
import { AppModalCancelTypes, ModalTypes } from '../../types'

interface ModalWrapperProps extends ModalDialogProps {
  modalType?: ModalTypes
  defaultValue?: string
}

const ModalWrapper = (props: ModalWrapperProps) => {

  const [state, setState] = useState<ModalDialogProps>()
  const ref = useRef()
  const formRef = useRef()
  const data = useRef()

  const getFormData = () => {
    if (formRef.current) {
      const formData = new FormData(formRef.current)
      const data = {}
      for (const pair of formData.entries()) {
        data[pair[0]] = pair[1]
      }
      return data
    }
  }

  const onFinishPrompt = async () => {
    if (ref.current === undefined && formRef.current === undefined) {
      onOkFn()
    } else if (formRef.current) {
      props.okFn ? props.okFn(getFormData()) : props.resolve(getFormData())
    } else if (ref.current) {
      props.okFn
        ? // @ts-ignore: Object is possibly 'null'.
        props.okFn(ref.current.value)
        : // @ts-ignore: Object is possibly 'null'.
        props.resolve(ref.current.value)
    }
  }

  const onOkFn = async () => {
    props.okFn ? props.okFn(data.current) : props.resolve(data.current || true)
  }

  const onCancelFn = async (reason?: AppModalCancelTypes) => {
    props.cancelFn ? props.cancelFn(reason) : props.resolve(false)
  }

  const onInputChanged = (event) => {
    if (props.validationFn) {
      const validation = props.validationFn(event.target.value)
      setState((prevState) => {
        return {
          ...prevState,
          message: createModalMessage(props.defaultValue, validation),
          validation
        }
      })
    }
  }

  const createModalMessage = (defaultValue: string, validation: ValidationResult) => {
    return (
      <>
        {props.message}
        <input
          key={defaultValue}
          onChange={onInputChanged}
          type={props.modalType === ModalTypes.password ? 'password' : 'text'}
          defaultValue={defaultValue}
          data-id="modalDialogCustomPromp"
          ref={ref}
          className="form-control"
        />
        {validation && !validation.valid && <span className="text-warning">{validation.message}</span>}
      </>
    )
  }

  const createFormWithTextArea = (defaultValue: string, placeholderText: string, validation: ValidationResult) => {
    return (
      <>
        {props.message}
        <textarea
          onChange={onInputChanged}
          defaultValue={defaultValue}
          data-id="modalDialogCustomTextarea"
          className="form-control"
          placeholder={placeholderText}
          ref={ref}
        />
        {validation && !validation.valid && <span className="text-warning">{validation.message}</span>}
      </>
    )
  }

  const onFormChanged = () => {
    if (props.validationFn) {
      const validation = props.validationFn(getFormData())
      setState((prevState) => {
        return { ...prevState, message: createForm(validation), validation }
      })
    }
  }

  const createForm = (validation: ValidationResult) => {
    return (
      <>
        <form onChange={onFormChanged} ref={formRef}>
          {props.message}
        </form>
        {validation && !validation.valid && <span className="text-warning">{validation.message}</span>}
      </>
    )
  }

  useEffect(() => {
    data.current = props.data
    if (props.modalType) {
      switch (props.modalType) {
      case ModalTypes.prompt:
      case ModalTypes.password:
        setState({
          ...props,
          okFn: onFinishPrompt,
          cancelFn: onCancelFn,
          message: createModalMessage(props.defaultValue, { valid: true })
        })
        break
      case ModalTypes.form:
        setState({
          ...props,
          okFn: onFinishPrompt,
          cancelFn: onCancelFn,
          message: createForm({ valid: true })
        })
        break
      case ModalTypes.fixed:
        setState({
          ...props,
          okFn: null,
          cancelFn: null,
          okLabel: null,
          cancelLabel: null,
          preventBlur: true,
          showCancelIcon: false,
        })
        break
      case ModalTypes.textarea:
        setState({
          ...props,
          okFn: onFinishPrompt,
          cancelFn: onCancelFn,
          message: createFormWithTextArea(props.defaultValue, props.placeholderText, { valid: true })
        })
        break
      default:
        setState({
          ...props,
          okFn: onOkFn,
          cancelFn: onCancelFn
        })
        break
      }
    } else {
      setState({
        ...props,
        okFn: onOkFn,
        cancelFn: onCancelFn
      })
    }
  }, [props])

  useEffect(() => {
    if (props.modalType === ModalTypes.textarea && ref.current) {
      setTimeout(() => {
        // make sure rendering is done before focusing
        if (ref.current && 'focus' in ref.current) {
          (ref.current as HTMLTextAreaElement).focus()
        }
      }, 300)
    }
  }, [props.modalType, state])

  // reset the message and input if any, so when the modal is shown again it doesn't show the previous value.
  const handleHide = () => {
    setState((prevState) => {
      return { ...prevState, message: '' }
    })
    props.handleHide()
  }

  if (!props.id || props.id === '') return null

  return <ModalDialog id={props.id} {...state} handleHide={handleHide} showCancelIcon={props.showCancelIcon} />
}
export default ModalWrapper
