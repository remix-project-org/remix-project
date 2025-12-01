import { IFilePanel } from '@remixproject/plugin-api'
import { StatusEvents } from '@remixproject/plugin-utils'

export interface ILayoutApi {
    events:{
    } & StatusEvents
    methods: {
        maximiseRightSidePanel: () => void
        maximiseSidePanel: () => void
        resetRightSidePanel: () => void
        resetSidePanel: () => void
    }
}
