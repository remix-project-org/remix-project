'use strict'
import { Plugin } from '@remixproject/engine'
import isElectron from 'is-electron'

const profile = {
  name: 'storageMonitor',
  displayName: 'Storage Monitor',
  description: 'Monitors workspace storage usage and reports to analytics',
  methods: ['calculateStorageStats'],
  events: [],
  version: '1.0.0'
}

interface WorkspaceStats {
  sizeKB: number
  codeOnlySizeKB: number // Size excluding .git, node_modules, .deps
  hasNodeModules: boolean
  nodeModulesSizeKB: number
  hasGit: boolean
  gitSizeKB: number
  hasDeps: boolean
  depsSizeKB: number
}

interface StorageSummary {
  // General stats (total including everything)
  workspaceCount: number
  totalSizeKB: number
  averageSizeKB: number
  medianSizeKB: number
  minSizeKB: number
  maxSizeKB: number

  // Code only stats (excluding .git, node_modules, .deps)
  totalCodeOnlySizeKB: number
  averageCodeOnlySizeKB: number
  medianCodeOnlySizeKB: number
  minCodeOnlySizeKB: number
  maxCodeOnlySizeKB: number

  // node_modules stats
  workspacesWithNodeModules: number
  totalNodeModulesSizeKB: number
  averageNodeModulesSizeKB: number
  minNodeModulesSizeKB: number
  maxNodeModulesSizeKB: number

  // .git stats
  workspacesWithGit: number
  totalGitSizeKB: number
  averageGitSizeKB: number
  minGitSizeKB: number
  maxGitSizeKB: number

  // .deps stats
  workspacesWithDeps: number
  totalDepsSizeKB: number
  averageDepsSizeKB: number
  minDepsSizeKB: number
  maxDepsSizeKB: number

  // Derived stats (percentages of total)
  codeOnlyPercentOfTotal: number
  nodeModulesPercentOfTotal: number
  gitPercentOfTotal: number
  depsPercentOfTotal: number
}

export class StorageMonitorPlugin extends Plugin {
  constructor() {
    super(profile)
  }

  private isDebugEnabled(): boolean {
    try {
      return localStorage.getItem('remix-storage-debug') === 'true'
    } catch {
      return false
    }
  }

  private log(...args: any[]): void {
    if (this.isDebugEnabled()) console.log(...args)
  }

  async onActivation(): Promise<void> {
    // Skip storage monitoring for desktop mode
    if (isElectron()) {
      this.log('Storage monitor: Skipping for desktop mode')
      return
    }

    // Run storage calculation in background after a short delay
    // to ensure the app is fully loaded
    setTimeout(() => {
      this.calculateStorageStats().catch(error => this.log('Storage monitor: Error calculating workspace storage stats:', error))
    }, 5000)
  }

  /**
   * Calculate the size of a directory recursively (in bytes)
   */
  private async calculateDirectorySize(path: string): Promise<number> {
    let totalSize = 0
    try {
      const fs = (window as any).remixFileSystem
      if (!fs || !await fs.exists(path)) return 0

      const items = await fs.readdir(path)
      for (const item of items) {
        const curPath = `${path}${path.endsWith('/') ? '' : '/'}${item}`
        const stat = await fs.stat(curPath)
        if (stat.isDirectory()) {
          totalSize += await this.calculateDirectorySize(curPath)
        } else {
          totalSize += stat.size || 0
        }
      }
    } catch (e) {
      this.log('Error calculating directory size:', e)
    }
    return totalSize
  }

  /**
   * Calculate median of an array of numbers
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }

  /**
   * Calculate storage stats for all workspaces and send summary to Matomo
   * Only runs for web storage (not desktop/Electron mode)
   */
  async calculateStorageStats(): Promise<StorageSummary | null> {
    try {
      const fs = (window as any).remixFileSystem

      if (!fs) {
        this.log('Storage monitor: No filesystem available')
        return null
      }

      if (!await fs.exists('/.workspaces')) {
        this.log('Storage monitor: No workspaces found')
        return null
      }

      const workspaceNames = await fs.readdir('/.workspaces')
      const workspaceStatsList: WorkspaceStats[] = []

      // Collect stats for each workspace
      for (const workspace of workspaceNames) {
        const workspacePath = `/.workspaces/${workspace}`
        const stat = await fs.stat(workspacePath)
        if (!stat.isDirectory()) continue

        const workspaceSize = await this.calculateDirectorySize(workspacePath)
        const workspaceSizeKB = Math.round(workspaceSize / 1024)

        // node_modules
        const nodeModulesPath = `${workspacePath}/node_modules`
        const hasNodeModules = await fs.exists(nodeModulesPath)
        let nodeModulesSizeKB = 0
        if (hasNodeModules) {
          const nodeModulesSize = await this.calculateDirectorySize(nodeModulesPath)
          nodeModulesSizeKB = Math.round(nodeModulesSize / 1024)
        }

        // .git
        const gitPath = `${workspacePath}/.git`
        const hasGit = await fs.exists(gitPath)
        let gitSizeKB = 0
        if (hasGit) {
          const gitSize = await this.calculateDirectorySize(gitPath)
          gitSizeKB = Math.round(gitSize / 1024)
        }

        // .deps
        const depsPath = `${workspacePath}/.deps`
        const hasDeps = await fs.exists(depsPath)
        let depsSizeKB = 0
        if (hasDeps) {
          const depsSize = await this.calculateDirectorySize(depsPath)
          depsSizeKB = Math.round(depsSize / 1024)
        }

        // Code only = total - node_modules - .git - .deps
        const codeOnlySizeKB = Math.max(0, workspaceSizeKB - nodeModulesSizeKB - gitSizeKB - depsSizeKB)

        workspaceStatsList.push({
          sizeKB: workspaceSizeKB,
          codeOnlySizeKB,
          hasNodeModules,
          nodeModulesSizeKB,
          hasGit,
          gitSizeKB,
          hasDeps,
          depsSizeKB
        })
      }

      if (workspaceStatsList.length === 0) {
        this.log('Storage monitor: No valid workspaces found')
        return null
      }

      // Calculate aggregated summary (no workspace names - privacy)
      const sizes = workspaceStatsList.map(w => w.sizeKB)
      const codeOnlySizes = workspaceStatsList.map(w => w.codeOnlySizeKB)
      const nodeModulesSizes = workspaceStatsList.filter(w => w.hasNodeModules).map(w => w.nodeModulesSizeKB)
      const gitSizes = workspaceStatsList.filter(w => w.hasGit).map(w => w.gitSizeKB)
      const depsSizes = workspaceStatsList.filter(w => w.hasDeps).map(w => w.depsSizeKB)

      const totalSizeKB = sizes.reduce((a, b) => a + b, 0)
      const totalCodeOnlySizeKB = codeOnlySizes.reduce((a, b) => a + b, 0)
      const totalNodeModulesSizeKB = nodeModulesSizes.reduce((a, b) => a + b, 0)
      const totalGitSizeKB = gitSizes.reduce((a, b) => a + b, 0)
      const totalDepsSizeKB = depsSizes.reduce((a, b) => a + b, 0)

      const summary: StorageSummary = {
        // General stats (total including everything)
        workspaceCount: workspaceStatsList.length,
        totalSizeKB,
        averageSizeKB: Math.round(totalSizeKB / workspaceStatsList.length),
        medianSizeKB: this.calculateMedian(sizes),
        minSizeKB: Math.min(...sizes),
        maxSizeKB: Math.max(...sizes),

        // Code only stats (excluding .git, node_modules, .deps)
        totalCodeOnlySizeKB,
        averageCodeOnlySizeKB: Math.round(totalCodeOnlySizeKB / workspaceStatsList.length),
        medianCodeOnlySizeKB: this.calculateMedian(codeOnlySizes),
        minCodeOnlySizeKB: Math.min(...codeOnlySizes),
        maxCodeOnlySizeKB: Math.max(...codeOnlySizes),

        // node_modules stats
        workspacesWithNodeModules: nodeModulesSizes.length,
        totalNodeModulesSizeKB,
        averageNodeModulesSizeKB: nodeModulesSizes.length > 0 ? Math.round(totalNodeModulesSizeKB / nodeModulesSizes.length) : 0,
        minNodeModulesSizeKB: nodeModulesSizes.length > 0 ? Math.min(...nodeModulesSizes) : 0,
        maxNodeModulesSizeKB: nodeModulesSizes.length > 0 ? Math.max(...nodeModulesSizes) : 0,

        // .git stats
        workspacesWithGit: gitSizes.length,
        totalGitSizeKB,
        averageGitSizeKB: gitSizes.length > 0 ? Math.round(totalGitSizeKB / gitSizes.length) : 0,
        minGitSizeKB: gitSizes.length > 0 ? Math.min(...gitSizes) : 0,
        maxGitSizeKB: gitSizes.length > 0 ? Math.max(...gitSizes) : 0,

        // .deps stats
        workspacesWithDeps: depsSizes.length,
        totalDepsSizeKB,
        averageDepsSizeKB: depsSizes.length > 0 ? Math.round(totalDepsSizeKB / depsSizes.length) : 0,
        minDepsSizeKB: depsSizes.length > 0 ? Math.min(...depsSizes) : 0,
        maxDepsSizeKB: depsSizes.length > 0 ? Math.max(...depsSizes) : 0,

        // Derived stats (percentages of total)
        codeOnlyPercentOfTotal: totalSizeKB > 0 ? Math.round((totalCodeOnlySizeKB / totalSizeKB) * 100) : 0,
        nodeModulesPercentOfTotal: totalSizeKB > 0 ? Math.round((totalNodeModulesSizeKB / totalSizeKB) * 100) : 0,
        gitPercentOfTotal: totalSizeKB > 0 ? Math.round((totalGitSizeKB / totalSizeKB) * 100) : 0,
        depsPercentOfTotal: totalSizeKB > 0 ? Math.round((totalDepsSizeKB / totalSizeKB) * 100) : 0
      }

      // Send single tracking event with JSON summary
      try {
        await this.call('matomo', 'trackEvent', {
          category: 'WorkspaceStorage',
          action: 'summary',
          name: JSON.stringify(summary),
          value: summary.totalSizeKB,
          isClick: false
        })
      } catch (error) {
        this.log('Storage monitor: Error tracking event', error)
      }

      this.log('Storage monitor: Summary', summary)
      return summary
    } catch (e) {
      this.log('Storage monitor: Error calculating workspace storage stats:', e)
      return null
    }
  }
}
