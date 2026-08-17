/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React from 'react'
import { Plugin } from '@remixproject/engine'
import { LibraryProfile, MethodApi, StatusEvents } from '@remixproject/plugin-utils'
import { AppModal } from '@remix-ui/app'
import { AlertModal } from '@remix-ui/app'
import { ActionNotification } from '@remix-ui/app'
import { dispatchModalInterface } from '@remix-ui/app'
import { Toaster, toast } from '@remix-ui/toaster'
import { ZkVerificationMethodModalContent } from '@remix-ui/quick-dapp-v2'

interface ZkVerificationMethodModalResult {
  verificationMethod: 'zkverify' | 'onchain';
  onChainVerifier?: { address: string; abi: any[]; chainId: string | number; networkName?: string; contractName?: string };
}

interface ZkVerificationMethodModalOptions {
  forceOnChain?: boolean;
}

interface INotificationApi {
  events: StatusEvents
  methods: {
    modal: (args: AppModal) => void
    alert: (args: AlertModal) => void
    toast: (message: string) => number
    hideToaster: (id: number) => void
    actionNotification: (args: ActionNotification) => void
    hideActionNotification: (id: string) => void
    showZkVerificationMethodModal: (options?: ZkVerificationMethodModalOptions) => ZkVerificationMethodModalResult | null
  }
}

const profile: LibraryProfile<INotificationApi> = {
  name: 'notification',
  displayName: 'Notification',
  description: 'Displays notifications',
  methods: ['modal', 'alert', 'toast', 'hideToaster', 'actionNotification', 'hideActionNotification', 'showZkVerificationMethodModal']
}

export class NotificationPlugin extends Plugin implements MethodApi<INotificationApi> {
  dispatcher: dispatchModalInterface
  toastId: number
  constructor() {
    super(profile)
    this.toastId = 0
  }

  setDispatcher(dispatcher: dispatchModalInterface) {
    this.dispatcher = dispatcher
  }

  async modal(args: AppModal) {
    return this.dispatcher.modal(args)
  }

  async alert(args: AlertModal) {
    return this.dispatcher.alert(args)
  }

  async toast(message: string | JSX.Element, timeout?: number, timestamp?: number): Promise<number> {
    timestamp = timestamp || Date.now()
    timestamp = timestamp + ++this.toastId
    this.dispatcher.toast(message, timeout, timestamp)
    return timestamp
  }

  async hideToaster(id: number) {
    toast.dismiss('toast-' + id)
  }

  async actionNotification(data: ActionNotification) {
    const id = data.id || `action-notif-${Date.now()}-${++this.toastId}`
    this.dispatcher.actionNotification({ ...data, id })
  }

  async hideActionNotification(id: string) {
    this.dispatcher.hideActionNotification(id)
  }

  async showZkVerificationMethodModal(options?: ZkVerificationMethodModalOptions): Promise<ZkVerificationMethodModalResult | null> {
    const resultRef: { current: ZkVerificationMethodModalResult | null } = { current: null }

    return new Promise((resolve) => {
      const modal: AppModal = {
        id: 'zkVerificationMethodModal',
        title: 'Choose Verification Method',
        message: <ZkVerificationMethodModalContent plugin={this} resultRef={resultRef} forceOnChain={options?.forceOnChain} />,
        okLabel: 'Continue',
        cancelLabel: 'Cancel',
        okFn: async () => {
          if (!resultRef.current) {
            try {
              await this.toast('No deployed verifier contract found. Please add a verifier contract first in the Deploy section.')
            } catch (e) { /* non-critical */ }
            resolve(null)
            return
          }
          resolve(resultRef.current)
        },
        cancelFn: () => resolve(null)
      }

      this.modal(modal)
    })
  }
}
