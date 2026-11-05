// eslint-disable-next-line no-unused-vars
import axios, { AxiosResponse } from 'axios'
import { endpointUrls } from '.'

export type GithubItem = {
  name: string
  path: string
  sha: string
  size: number
  url: string
  html_url: string
  git_url: string
  download_url: string | null
  type: 'dir' | 'file'
  _links: {
    self: string
    git: string
    html: string
  }
}

export const githubFolderResolver = async (url, obj = {}, maxDepth, depth?, rootPath?) => {
  depth = depth || 0
  const child = await pullFolder(url)
  depth = depth + 1
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  const pathParts = pathname.split('/');
  const folderPath = pathParts.slice(5).join('/');
  rootPath = rootPath || folderPath

  if (!Array.isArray(child)) return obj
  for (const item of child) {
    if (item.type === 'file') {
      if (!item.download_url) continue
      const response: AxiosResponse = await axios.get(item.download_url)
      obj[item.path.replace(rootPath, '')] = response.data
    } else if (maxDepth > depth) {
      // dir
      await githubFolderResolver(item.html_url, obj, maxDepth, depth, rootPath)
    }
  }
  return obj
}

const pullFolder = async (url) => {
  const response = await axios.get(endpointUrls.ghfolderpull, { params: { ghfolder: url } });
  const data: Array<GithubItem> = await response.data;
  return data
}

