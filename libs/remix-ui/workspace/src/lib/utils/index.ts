import { appPlatformTypes } from '@remix-ui/app'
import { FileType } from '@remix-ui/file-decorators'
import { MenuItems } from '../types'

export const contextMenuActions: MenuItems = [{
  id: 'newFile',
  name: 'New File',
  type: ['folder', 'workspace'],
  multiselect: false,
  label: '',
  group: 0
}, {
  id: 'newFolder',
  name: 'New Folder',
  type: ['folder', 'workspace'],
  multiselect: false,
  label: '',
  group: 0
}, {
  id: 'rename',
  name: 'Rename',
  type: ['file', 'folder'],
  multiselect: false,
  label: '',
  group: 0
}, {
  id: 'saveFile',
  name: 'Save',
  type: ['file'],
  multiselect: false,
  label: '',
  group: 0
}, {
  id: 'delete',
  name: 'Delete',
  type: ['file', 'folder'],
  multiselect: false,
  label: '',
  group: 0
}, {
  id: 'deleteAll',
  name: 'Delete All',
  type: ['folder', 'file'],
  multiselect: true,
  label: '',
  group: 0
}, {
  id: 'copy',
  name: 'Copy',
  type: ['folder', 'file'],
  multiselect: false,
  label: '',
  group: 1
}, {
  id: 'copyFileName',
  name: 'Copy name',
  type: ['file'],
  multiselect: false,
  label: '',
  group: 1
}, {
  id: 'copyFilePath',
  name: 'Copy path',
  type: ['file'],
  multiselect: false,
  label: '',
  group: 1
}, {
//   id: 'copyShareURL',
//   name: 'Copy share URL',
//   type: ['file'],
//   multiselect: false,
//   label: '',
//   group: 1
// }, {
  id: 'download',
  name: 'Download',
  type: ['file', 'folder', 'workspace'],
  multiselect: false,
  label: '',
  group: 2,
  platform: appPlatformTypes.web
}, {
  id: 'run',
  name: 'Run',
  extension: ['.js', '.ts'],
  multiselect: false,
  label: '',
  group: 3
}, {
  id: 'signTypedData',
  name: 'Sign Typed Data',
  extension: ['.json'],
  multiselect: false,
  label: '',
  group: 3
}, {
  id: 'publishFolderToGist',
  name: 'Publish folder to gist',
  type: ['folder'],
  multiselect: false,
  label: '',
  group: 4,
  platform: appPlatformTypes.web
}, {
  id: 'publishFileToGist',
  name: 'Publish file to gist',
  type: ['file'],
  multiselect: false,
  label: '',
  group: 4,
  platform: appPlatformTypes.web
}, {
  id: 'publishFilesToGist',
  name: 'Publish files to gist',
  type: ['file'],
  multiselect: true,
  label: '',
  group: 4,
  platform: appPlatformTypes.web
}
, {
  id: 'uploadFile',
  name: 'Load a Local File',
  type: ['folder', 'workspace'],
  multiselect: false,
  label: 'Load a Local File',
  group: 4,
  platform: appPlatformTypes.web
},{
  id: 'publishWorkspace',
  name: 'Publish Workspace to Gist',
  type: ['workspace'],
  multiselect: false,
  label: '',
  group: 4,
  platform: appPlatformTypes.web
}]

export const fileKeySort = (fileTree: any) => {
  fileTree = fileTree || {}
  const directories = Object.keys(fileTree).filter((key: string) => !key.includes('....blank') && fileTree[key].isDirectory)

  directories.sort((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase()))

  const fileKeys = Object.keys(fileTree).filter((key: string) => !key.includes('....blank') && !fileTree[key].isDirectory)

  fileKeys.sort((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase()))
  // find the input elementfileTree

  const blank = Object.keys(fileTree).find((key: string) => key.includes('....blank'))
  if (fileTree[blank]) {
    fileKeys.push(blank)
  }
  const keys = [...directories, ...fileKeys]
  // rebuild the fileTree using the keys
  const newFileTree: FileType[] = []
  keys.forEach((key: string) => {
    newFileTree.push(fileTree[key])
  })
  return newFileTree
}
