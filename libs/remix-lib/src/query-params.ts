'use strict'

export class QueryParams {

  update (params) {
    const currentParams = this.get()
    const keys = Object.keys(params)
    for (const x in keys) {
      currentParams[keys[x]] = params[keys[x]]
    }
    let queryString = '#'
    const updatedKeys = Object.keys(currentParams)
    for (const y in updatedKeys) {
      if (currentParams[updatedKeys[y]]) {
        queryString += updatedKeys[y] + '=' + currentParams[updatedKeys[y]] + '&'
      } else {
        queryString += updatedKeys[y] + '&'
      }
    }
    window.location.hash = queryString.slice(0, -1)
  }

  exists (key) {
    const params = this.get()
    return Object.keys(params).includes(key)
  }

  get () {
    const qs = window.location.hash.substr(1)

    if (window.location.search.length > 0) {
      // use legacy query params instead of hash
      window.location.hash = window.location.search.substr(1)
      window.location.search = ''
    }

    const params = {}
    const parts = qs.split('&')
    for (const x in parts) {
      const keyValue = parts[x].split('=')
      if (keyValue[0] !== '') {
        params[keyValue[0]] = keyValue[1]
      }
    }
    return params
  }
}
