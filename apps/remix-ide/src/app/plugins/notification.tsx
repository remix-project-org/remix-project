/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import { Plugin } from '@remixproject/engine'
import { LibraryProfile, MethodApi, StatusEvents } from '@remixproject/plugin-utils'
import { AppModal } from '@remix-ui/app'
import { AlertModal } from '@remix-ui/app'
import { dispatchModalInterface } from '@remix-ui/app'

interface INotificationApi {
  events: StatusEvents
  methods: {
    modal: (args: AppModal) => void
    alert: (args: AlertModal) => void
    toast: (message: string) => void

  }
}

const profile: LibraryProfile<INotificationApi> = {
  name: 'notification',
  displayName: 'Notification',
  description: 'Displays notifications',
  methods: ['modal', 'alert', 'toast']
}

export class NotificationPlugin extends Plugin implements MethodApi<INotificationApi> {
  dispatcher: dispatchModalInterface
  constructor() {
    super(profile)
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

  async toast(message: string | JSX.Element) {
    this.dispatcher.toast(message)
  }
}
