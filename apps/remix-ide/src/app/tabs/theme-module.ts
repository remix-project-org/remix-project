import { Plugin } from '@remixproject/engine'
import { EventEmitter } from 'events'
import { QueryParams } from '@remix-project/remix-lib'
import * as packageJson from '../../../../../package.json'
import { Registry } from '@remix-project/remix-lib'
import { trackMatomoEvent } from '@remix-api'
import isElectron from 'is-electron'

interface Theme {
  name: string;
  quality: 'dark' | 'light';
  url: string;
  backgroundColor: string;
  textColor: string;
  shapeColor: string;
  fillColor: string;
}

//sol2uml dot files cannot work with css variables so hex values for colors are used
const themes = [
  { name: 'Dark', quality: 'dark', url: 'assets/css/themes/remix-dark_tvx1s2.css', backgroundColor: '#222336', textColor: '#babbcc',
    shapeColor: '#babbcc',fillColor: '#2a2c3f' },
  { name: 'Light', quality: 'light', url: 'assets/css/themes/remix-light_powaqg.css', backgroundColor: '#eef1f6', textColor: '#3b445e',
    shapeColor: '#343a40',fillColor: '#ffffff' },
]

const profile = {
  name: 'theme',
  events: ['themeChanged'],
  methods: ['switchTheme', 'getThemes', 'currentTheme', 'fixInvert'],
  version: packageJson.version,
  kind: 'theme'
}

export class ThemeModule extends Plugin {
  events: EventEmitter;
  _deps: { config?: any };
  themes: { [key: string]: Theme };
  currentThemeState: { queryTheme: string | null; currentTheme: string | null };
  active: string;
  forced: boolean;
  initCallback?: () => void;

  constructor() {
    super(profile)
    this.events = new EventEmitter()
    this._deps = {
      config: Registry.getInstance().get('config') && Registry.getInstance().get('config').api
    }
    this.themes = {}
    themes.map((theme) => {
      this.themes[theme.name.toLocaleLowerCase()] = {
        ...theme,
        quality: theme.quality as 'dark' | 'light',
        url: isElectron()
          ? theme.url
          : window.location.pathname.startsWith('/auth')
            ? window.location.origin + '/' + theme.url
            : window.location.origin + (window.location.pathname.startsWith('/address/') || window.location.pathname.endsWith('.sol') ? '/' : window.location.pathname) + theme.url
      } as Theme
    })
    // Tracking now handled via plugin API
    let queryTheme = (new QueryParams()).get()['theme'] as string
    queryTheme = queryTheme && queryTheme.toLocaleLowerCase()
    queryTheme = this.themes[queryTheme] ? queryTheme : null
    let currentTheme = (this._deps.config && this._deps.config.get('settings/theme')) || null
    currentTheme = currentTheme && currentTheme.toLocaleLowerCase()
    currentTheme = this.themes[currentTheme] ? currentTheme : null
    this.currentThemeState = { queryTheme, currentTheme }
    this.active = queryTheme || currentTheme || 'dark'
    this.forced = !!queryTheme
  }

  /** Return the active theme
   * @return {{ name: string, quality: string, url: string }} - The active theme
  */
  currentTheme(): Theme {
    if (isElectron()) {
      const theme = 'https://remix.ethereum.org/' + this.themes[this.active].url.replace(/\\/g, '/').replace(/\/\//g, '/').replace(/\/$/g, '')
      return { ...this.themes[this.active], url: theme }
    }
    return this.themes[this.active]
  }

  /** Returns all themes as an array */
  getThemes(): Theme[] {
    return Object.keys(this.themes).map(key => this.themes[key])
  }

  /**
   * Init the theme
   */
  initTheme(callback?: () => void): void { // callback is setTimeOut in app.js which is always passed
    if (callback) this.initCallback = callback
    if (this.active) {
      document.getElementById('theme-link') ? document.getElementById('theme-link').remove() : null
      const nextTheme = this.themes[this.active] // Theme
      document.documentElement.style.setProperty('--theme', nextTheme.quality)

      const theme = document.createElement('link')
      theme.setAttribute('rel', 'stylesheet')
      theme.setAttribute('href', nextTheme.url)
      theme.setAttribute('id', 'theme-link')
      theme.addEventListener('load', () => {
        if (callback) callback()
      })
      document.head.insertBefore(theme, document.head.firstChild)
      //if (callback) callback()
    }
  }

  /**
   * Change the current theme
   * @param {string} [themeName] - The name of the theme
   */
  switchTheme(themeName?: string): void {
    themeName = themeName && themeName.toLocaleLowerCase()
    if (themeName && !Object.keys(this.themes).includes(themeName)) {
      throw new Error(`Theme ${themeName} doesn't exist`)
    }
    const next = themeName || this.active // Name
    if (next === this.active) return // --> exit out of this method
    trackMatomoEvent(this, { category: 'theme', action: 'switchThemeTo', name: next, isClick: true })
    const nextTheme = this.themes[next] // Theme
    if (!this.forced) this._deps.config.set('settings/theme', next)
    document.getElementById('theme-link') ? document.getElementById('theme-link').remove() : null

    const theme = document.createElement('link')
    theme.setAttribute('rel', 'stylesheet')
    theme.setAttribute('href', nextTheme.url)
    theme.setAttribute('id', 'theme-link')
    theme.addEventListener('load', () => {
      this.emit('themeLoaded', nextTheme)
      this.events.emit('themeLoaded', nextTheme)
    })
    document.head.insertBefore(theme, document.head.firstChild)
    document.documentElement.style.setProperty('--theme', nextTheme.quality)
    if (themeName) this.active = themeName
    // TODO: Only keep `this.emit` (issue#2210)
    if (isElectron()) {
      const theme = 'https://remix.ethereum.org/' + nextTheme.url.replace(/\\/g, '/').replace(/\/\//g, '/').replace(/\/$/g, '')
      this.emit('themeChanged', { ...nextTheme, url: theme })
      this.events.emit('themeChanged', { ...nextTheme, url: theme })
    } else {
      this.emit('themeChanged', nextTheme)
      this.events.emit('themeChanged', nextTheme)
    }
  }

  /**
   * fixes the inversion for images since this should be adjusted when we switch between dark/light qualified themes
   * @param {element} [image] - the dom element which invert should be fixed to increase visibility
   */
  fixInvert(image?: HTMLElement): void {
    const invert = this.currentTheme().quality === 'dark' ? 1 : 0
    if (image) {
      image.style.filter = `invert(${invert})`
    }
  }
}
