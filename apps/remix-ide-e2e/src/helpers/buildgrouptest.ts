export default function buildGroupTest (group: string, test: any) {
  const ob = {}
  // eslint-disable-next-line dot-notation
  const defaults = test['default']
  
  for (const key of Object.keys(defaults)) {
    if (typeof defaults[key] === 'function') {
      // Match exact group boundary: #{group} at end of string or followed by space
      const groupPattern = `#${group}`
      const hasExactMatch = key.endsWith(groupPattern) || key.includes(groupPattern + ' ')
      
      if (hasExactMatch || key.indexOf('#group') === -1) {
        ob[key.replace(groupPattern, '')] = defaults[key]
      }
    }
  }
  console.log(ob)
  return ob
}
