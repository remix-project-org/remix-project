
import React, {useState} from 'react' // eslint-disable-line
import { ViewPlugin } from '@remixproject/engine-web'
import { PluginViewWrapper } from '@remix-ui/helper'
import { trackMatomoEvent } from '@remix-api'
import { RemixAppManager } from '../../remixAppManager'
import { RemixUIGridView } from '@remix-ui/remix-ui-grid-view'
import { RemixUIGridSection } from '@remix-ui/remix-ui-grid-section'
import { RemixUIGridCell } from '@remix-ui/remix-ui-grid-cell'
import * as Data from './remixGuideData.json'
import './remixGuide.css'

const profile = {
  name: 'remixGuide',
  displayName: 'Remix Guide',
  description: 'Learn Web3 development using Remix with videos.',
  location: 'mainPanel',
  icon: 'data:image/png;base64,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',
  maintainedBy: 'Remix',
  events: [],
  methods: []
}

export class RemixGuidePlugin extends ViewPlugin {
  dispatch: React.Dispatch<any> = () => { }
  appManager: RemixAppManager
  element: HTMLDivElement
  payload: any
  showVideo: boolean
  videoID: string
  handleKeyDown: any
  handleEscape: any

  constructor(appManager: RemixAppManager) {
    super(profile)
    this.appManager = appManager
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'remixGuideEl')
    this.payload = {
      sectionToExpandedCell: [['', '']],
      data: {}
    }
  }

  async onActivation() {
    this.handleThemeChange()
    await this.call('tabs', 'focus', 'remixGuide')
    this.renderComponent()
    trackMatomoEvent(this, { category: 'plugin', action: 'activated', name: 'remixGuide', isClick: true })
    // Read the data
    this.payload.data = Data
    this.handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        this.showVideo = false
        this.renderComponent()
      }
    }
    document.addEventListener('keydown', this.handleKeyDown);
  }

  onDeactivation(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleThemeChange() {
    this.on('theme', 'themeChanged', (theme: any) => {
      this.renderComponent()
    })
  }

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }

  render() {
    return (
      <div className="bg-dark" id="remixGuide">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  renderComponent() {
    this.dispatch({
      ...this,
      ...this.payload,
      showVideo: this.showVideo,
      videoID: this.videoID
    })
  }

  updateComponent(state: any) {
    return (
      <div className='d-flex'>
        <RemixUIGridView
          plugin={this}
          logo='assets/img/YouTubeLogo.webp'
          enableFilter={true}
          showUntagged={true}
          showPin={false}
          tagList={[
            ['Remix', 'primary'],
            ['Beginner', 'danger'],
            ['Advanced', 'warning'],
            ['AI', 'success'],
            ['Plugins', 'secondary'],
            ['Solidity', 'primary'],
            ['EVM', 'secondary']
          ]}
          title={Data.title}
          description={Data.description}
        >
          { Data.sections.map((section, index) => {
            return <RemixUIGridSection
              plugin={this}
              title={section.title}
              hScrollable={true}
              key={index}
            >
              { section.cells.map((cell, index) => {
                return <RemixUIGridCell
                  plugin={this}
                  title={cell.title}
                  titleTooltip={cell.titleTooltip}
                  tagList={cell.tagList}
                  classList='RGCellStyle'
                  expandViewEl={
                    cell.expandViewElement
                  }
                  key={cell.title || index}
                  id={cell.title}
                  handleExpand={() => {
                    this.showVideo = true
                    this.videoID = cell.expandViewElement.videoID
                    this.renderComponent()
                    trackMatomoEvent(this, { category: 'remixGuide', action: 'playGuide', name: cell.title, isClick: true })
                  }}
                >
                  <img
                    src={"//img.youtube.com/vi/" + cell.expandViewElement.videoID + "/0.jpg"}
                    style={{ height: '100px', width: 'fit-content', cursor: 'pointer' }}
                  ></img>
                </RemixUIGridCell>
              })}
            </RemixUIGridSection>
          })}
        </RemixUIGridView>
        { state.showVideo && <div
          data-id={`EnterModalDialogContainer-react`}
          data-bs-backdrop="static"
          data-bs-keyboard="false"
          className={"modal d-flex"}
          role="dialog"
          style={{ justifyContent: "center" }}
        >
          <div className="align-self-center pb-4" role="document">
            <div
              tabIndex={-1}
              className={'modal-content remixModalContent mb-4'}
            >
              <div className="text-break remixModalBody d-flex flex-column p-3 justify-content-between" data-id={`EnterModalDialogModalBody-react`}>
                <iframe style={{ minHeight: "500px", minWidth: "1000px" }} width="1000" height="500" src={"https://www.youtube.com/embed/" + this.videoID + "?si=ZdckOaSPR7VsLj_2"} allowFullScreen></iframe>
              </div>
              <div className="modal-footer d-flex flex-column">
                <button className="btn btn-secondary" onClick={() => {
                  this.showVideo = false
                  this.renderComponent()
                }}>Close</button>
              </div>
            </div>
          </div>
        </div>}
      </div>
    )
  }

}
