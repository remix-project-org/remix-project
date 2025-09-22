const branches = {
  'beta.remix.live': 'beta',
  'alpha.remix.live': 'alpha',
  'remix.ethereum.org': 'live'
}

const getBaseUrl = () => {
  const branch = branches[window.location.hostname] || 'live'
  return `https://raw.githubusercontent.com/remix-project-org/remix-dynamics/refs/heads/${branch}/`
}

export const HOME_TAB_BASE_URL = getBaseUrl()
export const HOME_TAB_NEW_UPDATES = HOME_TAB_BASE_URL + 'hometab/new-updates.json'
export const HOME_TAB_PLUGIN_LIST = HOME_TAB_BASE_URL + 'hometab/plugin-list.json'
