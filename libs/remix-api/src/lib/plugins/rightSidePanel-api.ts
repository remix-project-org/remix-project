import { IFilePanel } from '@remixproject/plugin-api'
import { StatusEvents } from '@remixproject/plugin-utils'

export interface IRightSidePanelApi {
    events:{
        
    } & StatusEvents
    methods: {
        currentFocus(): Promise<string>
    }
}
