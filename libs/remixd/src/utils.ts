import { ResolveDirectory, Filelist } from './types' // eslint-disable-line
import * as fs from 'fs-extra'
import * as isbinaryfile from 'isbinaryfile'
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
  if (!isSubDirectory(pathModule.resolve(process.cwd(), sharedFolder), path)) throw new Error('Cannot read/write to path outside shared folder.')
  return path
}

/**
 * returns a true if child is sub-directory of parent.
 *
 * @param {String} parent - path to parent directory
 * @param {String} child - child path
 * @return {Boolean}
 */
function isSubDirectory (parent: string, child: string) {
  if (!parent) return false
  if (parent === child) return true
  const relative = pathModule.relative(parent, child)

  return !!relative && relative.split(pathModule.sep)[0] !== '..'
}

/**
 * return the relative path of the given @arg path
 *
 * @param {String} path - absolute platform dependent path
 * @param {String} sharedFolder - absolute shared path. platform dependent representation
 * @return {String} relative path (Unix style which is the one used by Remix Web3)
 */
function relativePath (path: string, sharedFolder: string): string {
  const relative: string = pathModule.relative(sharedFolder, path)

  return convertPathToPosix(normalizePath(relative))
}

const convertPathToPosix = (pathName: string): string => {
  return pathName.split(pathModule.sep).join(pathModule.posix.sep)
}

function normalizePath (path) {
  if (path === '/') path = './'
  if (process.platform === 'win32') {
    return path.replace(/\//g, '\\')
  }
  return path
}

function walkSync (dir: string, filelist: Filelist, sharedFolder: string): Filelist {
  const files: string[] = fs.readdirSync(dir)

  filelist = filelist || {}
  files.forEach(function (file) {
    const subElement = pathModule.join(dir, file)
    let isSymbolicLink

    try {
      isSymbolicLink = !fs.lstatSync(subElement).isSymbolicLink()
    } catch (error) {
      isSymbolicLink = false
    }

    if (isSymbolicLink) {
      if (fs.statSync(subElement).isDirectory()) {
        filelist = walkSync(subElement, filelist, sharedFolder)
      } else {
        const relative = relativePath(subElement, sharedFolder)

        filelist[relative] = isbinaryfile.sync(subElement)
      }
    }
  })
  return filelist
}

function resolveDirectory (dir: string, sharedFolder: string): ResolveDirectory {
  const ret: ResolveDirectory = {}
  const files: string[] = fs.readdirSync(dir)

  files.forEach(function (file) {
    const subElement = pathModule.join(dir, file)
    let isSymbolicLink

    try {
      isSymbolicLink = !fs.lstatSync(subElement).isSymbolicLink()
    } catch (error) {
      isSymbolicLink = false
    }
    if (isSymbolicLink) {
      const relative: string = relativePath(subElement, sharedFolder)

      ret[relative] = { isDirectory: fs.statSync(subElement).isDirectory() }
    }
  })
  return ret
}

/**
 * returns the absolute path of the given @arg url
 *
 * @param {String} url - Remix-IDE URL instance
 * @return {String} extracted domain name from url
 */
function getDomain (url: string) {
  // eslint-disable-next-line
  const domainMatch = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n?]+)/img)

  return domainMatch ? domainMatch[0] : null
}

export { absolutePath, relativePath, walkSync, resolveDirectory, getDomain, normalizePath }
