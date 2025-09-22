import { Plugin } from '@remixproject/engine'
import * as packageJson from '../../../package.json'
const introJs = require('intro.js')

const profile = {
  name: 'walkthrough',
  displayName: 'Walkthrough',
  description: 'Remix walkthrough for beginner',
  version: packageJson.version,
  methods: ['startRecorderW']
}

export class WalkthroughService extends Plugin {
  constructor (appManager) {
    super(profile)
  }

  startRecorderW () {
    introJs().setOptions({
      steps: [{
        title: 'Transactions Recorder',
        intro: 'Save transactions (deployed contracts and function executions) and replay them in another environment e.g Transactions created in Remix VM can be replayed in the Injected Provider.',
        element: document.querySelector('#udappRecorderCard'),
        tooltipClass: 'bg-light text-dark',
        position: 'right',
        highlightClass: 'bg-light border border-warning'
      },
      {
        element: document.querySelector('#udappRecorderUseLatest'),
        title: 'Transactions Recorder',
        intro: 'If selected, the recorder will run transactions using the latest compilation result.',
        tooltipClass: 'bg-light text-dark',
        position: 'right',
        highlightClass: 'bg-light border border-warning'
      },
      {
        element: document.querySelector('#udappRecorderSave'),
        title: 'Transactions Recorder',
        intro: 'Once one or more transactions have been executed, click this button to save these transactions as a scenario file.',
        tooltipClass: 'bg-light text-dark',
        position: 'right',
        highlightClass: 'bg-light border border-warning'
      },
      {
        element: document.querySelector('#udappRecorderRun'),
        title: 'Transactions Recorder',
        intro: 'Open a scenario file and click this button to run it against the current selected provider.',
        tooltipClass: 'bg-light text-dark',
        position: 'right',
        highlightClass: 'bg-light border border-warning'
      }
      ]
    }).onafterchange((targetElement) => {
      const header = document.getElementsByClassName('introjs-tooltip-header')[0]
      if (header) {
        header.classList.add('d-flex')
        header.classList.add('justify-content-between')
        header.classList.add('text-nowrap')
        header.classList.add('pe-0')
        header.id="remixRecorderWalkthrowTitle"
      }
      const skipbutton = document.getElementsByClassName('introjs-skipbutton')[0]
      if (skipbutton) {
        skipbutton.classList.add('ms-3')
        skipbutton.classList.add('text-decoration-none')
        skipbutton.id = 'remixTourSkipbtn'
      }
    }).start()
  }
}
