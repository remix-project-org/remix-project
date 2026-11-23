import * as pathModule from 'path'
/**
 * returns the absolute path of the given @arg path
 *
 * @param {String} path - relative path (Unix style which is the one used by Remix Web3)
 * @param {String} sharedFolder - absolute shared path. platform dependent representation.
 * @return {String} platform dependent absolute path (/home/user1/.../... for unix, c:\user\...\... for windows)
 */
function absolutePath (path: string, sharedFolder:string): string {
  path = normalizePath(path)
  path = pathModule.resolve(sharedFolder, path)
  return path
}
function normalizePath (path) {
  if (path === '/') path = './'
  if (process.platform === 'win32') {
    return path.replace(/\//g, '\\')
  }
  return path
}

export { absolutePath, normalizePath }


