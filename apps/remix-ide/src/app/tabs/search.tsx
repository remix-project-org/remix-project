import { ViewPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
import React from 'react' // eslint-disable-line
import { SearchTab } from '@remix-ui/search'
const profile = {
  name: 'search',
  displayName: 'Search in files',
  methods: [''],
  events: ['searchResultClicked'],
  icon: 'assets/img/search_icon.webp',
  description: 'Find and replace in file explorer',
  kind: '',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/search_in_fe.html',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

export class SearchPlugin extends ViewPlugin {
  constructor() {
    super(profile)
  }

  render() {
    return (
      <div id="searchTab">
        <SearchTab plugin={this}></SearchTab>
      </div>
    )
  }
}
