import { TemplateExplorerWizardAction, WizardStep } from '../types/template-explorer-types'

type ActionWithPayload = { type: TemplateExplorerWizardAction, payload?: any }
export interface TemplateExplorerStrategy {
  activateScreen: (dispatch: (action: ActionWithPayload) => void) => void
}

export class TemplateCategoryStrategy {
  strategy: TemplateExplorerStrategy

  setStrategy(strategy: TemplateExplorerStrategy) {
    this.strategy = strategy
  }

  switchScreen(dispatch: (action: ActionWithPayload) => void) {
    this.strategy && this.strategy.activateScreen(dispatch)
  }
}

export class RemixDefaultStrategy implements TemplateExplorerStrategy {

  activateScreen(dispatch: (action: ActionWithPayload) => void) {
    dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'remixdefault' })
  }
}

export class GenericStrategy implements TemplateExplorerStrategy {
  activateScreen(dispatch: (action: ActionWithPayload) => void) {
    dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'generic' })
  }
}

export class WizardStrategy implements TemplateExplorerStrategy {

  activateScreen(dispatch: (action: ActionWithPayload) => void) {
    dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'wizard' })
  }
}

export class CookbookStrategy implements TemplateExplorerStrategy {

  activateScreen(dispatch: (action: ActionWithPayload) => void) {
    dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'cookbook' })
  }
}

export class GenAiStrategy implements TemplateExplorerStrategy {

  activateScreen(dispatch: (action: ActionWithPayload) => void) {
    dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'genAI' })
  }
}

export class BasicStrategy implements TemplateExplorerStrategy {

  activateScreen(dispatch: (action: ActionWithPayload) => void) {
    dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'basic' })
  }
}

export class ScriptsStrategy implements TemplateExplorerStrategy {

  activateScreen(dispatch: (action: ActionWithPayload) => void) {
    dispatch({ type: TemplateExplorerWizardAction.MODIFY_WORKSPACE, payload: 'ModifyWorkspace' })
  }
}
