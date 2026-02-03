/**
 * MCP Configuration Manager
 * Loads and manages .mcp.config.json configuration
 */

import { Plugin } from '@remixproject/engine';
import { MCPConfig, defaultMCPConfig, minimalMCPConfig } from '../types/mcpConfig';

export class MCPConfigManager {
  private config: MCPConfig;
  private plugin: Plugin;
  private configPath: string = 'remix.config.json';

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.config = defaultMCPConfig;
    this.plugin.on('fileManager', 'fileSaved', async (filePath: string) => {
      if (filePath === this.configPath){
        const exists = await this.plugin.call('fileManager', 'exists', this.configPath);

        if (exists) {
          try {
            const configContent = await this.plugin.call('fileManager', 'readFile', this.configPath);

            // Handle empty or whitespace-only files
            if (!configContent || configContent.trim() === '') {
              console.log('[MCPConfigManager] Config file saved as empty, writing default config');
              await this.saveConfig(minimalMCPConfig);
              return;
            }

            const userConfig = JSON.parse(configContent);
            if (userConfig.mcp) {
              // Merge with defaults to preserve any new default settings
              this.config = this.mergeConfig(defaultMCPConfig, userConfig.mcp);
              console.log('[MCPConfigManager] Config reloaded from file save');
            } else {
              console.log('[MCPConfigManager] No mcp config in saved file, writing default');
              await this.saveConfig(minimalMCPConfig);
            }
          } catch (error) {
            console.error('[MCPConfigManager] Error reloading config on file save:', error);
            // If there's an error, write the default config
            try {
              await this.saveConfig(minimalMCPConfig);
            } catch (saveError) {
              console.error('[MCPConfigManager] Error writing default config:', saveError);
            }
          }
        }
      }
    });
  }

  async loadConfig(): Promise<MCPConfig> {
    try {
      const exists = await this.plugin.call('fileManager', 'exists', this.configPath);

      if (exists) {
        const configContent = await this.plugin.call('fileManager', 'readFile', this.configPath);

        // Handle empty or whitespace-only files
        if (!configContent || configContent.trim() === '') {
          console.log('[MCPConfigManager] Config file is empty, creating default');
          this.config = minimalMCPConfig;
          await this.saveConfig(this.config);
          return this.config;
        }

        try {
          const userConfig = JSON.parse(configContent);

          // Merge with defaults
          if (userConfig?.mcp) {
            this.config = this.mergeConfig(defaultMCPConfig, userConfig.mcp);
            console.log('[MCPConfigManager] Config loaded from file:', this.configPath);

            // Validate fileWritePermissions mode
            if (this.config.security.fileWritePermissions?.mode) {
              const validModes = ['ask', 'allow-all', 'deny-all', 'allow-specific'];
              if (!validModes.includes(this.config.security.fileWritePermissions.mode)) {
                console.warn('[MCPConfigManager] Invalid fileWritePermissions mode, resetting to "ask"');
                this.config.security.fileWritePermissions.mode = 'ask';
              }
            }
          } else {
            console.log('[MCPConfigManager] No mcp config in file, creating default');
            this.config = minimalMCPConfig;
            await this.saveConfig(this.config);
          }
        } catch (parseError) {
          console.error('[MCPConfigManager] Error parsing config file, creating default:', parseError);
          this.config = minimalMCPConfig;
          await this.saveConfig(this.config);
        }
      } else {
        console.log('[MCPConfigManager] Config file does not exist, creating default');
        this.config = minimalMCPConfig;
        await this.saveConfig(this.config);
      }

      return this.config;
    } catch (error) {
      console.error('[MCPConfigManager] Error loading config:', error);
      this.config = defaultMCPConfig;
      return this.config;
    }
  }

  async saveConfig(config: MCPConfig): Promise<void> {
    try {
      const exists = await this.plugin.call('fileManager', 'exists', this.configPath);
      let userConfig: any = {};

      if (exists) {
        try {
          const remixConfig = await this.plugin.call('fileManager', 'readFile', this.configPath);

          // Handle empty or whitespace-only files
          if (remixConfig && remixConfig.trim() !== '') {
            userConfig = JSON.parse(remixConfig);
          } else {
            // File exists but is empty, start with empty object
            console.log('[MCPConfigManager] Existing config file is empty, starting fresh');
            userConfig = {};
          }
        } catch (parseError) {
          // If parsing fails, log warning and start fresh
          console.warn('[MCPConfigManager] Could not parse existing config, starting fresh:', parseError);
          userConfig = {};
        }
      }

      userConfig['mcp'] = config;
      const newConfigContent = JSON.stringify(userConfig, null, 2);
      await this.plugin.call('fileManager', 'writeFile', this.configPath, newConfigContent);
      this.config = config;
      console.log('[MCPConfigManager] Config saved successfully');
    } catch (error) {
      console.error(`[MCPConfigManager] Error saving config: ${error.message}`);
      throw error;
    }
  }

  async createDefaultConfig(): Promise<void> {
    try {

      const exists = await this.plugin.call('fileManager', 'exists', this.configPath);
      if (exists) {
        console.log('[MCPConfigManager] Config file already exists, skipping creation');
        return;
      }

      await this.saveConfig(defaultMCPConfig);
      console.log('[MCPConfigManager] Default config file created');
    } catch (error) {
      console.error(`[MCPConfigManager] Error creating default config: ${error.message}`);
      throw error;
    }
  }

  getConfig(): MCPConfig {
    return this.config;
  }

  getSecurityConfig() {
    return this.config.security;
  }

  getValidationConfig() {
    return this.config.validation;
  }

  getResourceConfig() {
    return this.config.resources;
  }

  getFileWritePermission() {
    const permissions = this.config.security.fileWritePermissions || {
      mode: 'ask' as const,
      allowedFiles: [],
      lastPrompted: null
    };
    return permissions;
  }

  updateConfig(partialConfig: Partial<MCPConfig>): void {
    this.config = this.mergeConfig(this.config, partialConfig);
    console.log('[MCPConfigManager] Config updated at runtime');
  }

  async setFileWritePermission(
    mode: 'ask' | 'allow-all' | 'deny-all' | 'allow-specific',
    filePath?: string
  ): Promise<void> {
    const config = this.getConfig();

    if (!config.security.fileWritePermissions) {
      config.security.fileWritePermissions = {
        mode: 'ask',
        allowedFiles: [],
        lastPrompted: null
      };
    }

    const perms = config.security.fileWritePermissions;
    perms.mode = mode;
    perms.lastPrompted = new Date().toISOString();

    if (mode === 'allow-specific' && filePath) {
      if (!perms.allowedFiles.includes(filePath)) {
        perms.allowedFiles.push(filePath);
      }
    }

    await this.saveConfig(config);
    console.log(`[MCPConfigManager] File write permission updated: ${mode}${filePath ? ` for ${filePath}` : ''}`);
  }

  isToolAllowed(toolName: string): boolean {
    const { excludeTools } = this.config.security;

    if (excludeTools && excludeTools.includes(toolName)) {
      return false;
    }

    return true;
  }

  isPathAllowed(path: string): boolean {
    const { blockedPaths, allowedPaths } = this.config.security;

    if (blockedPaths) {
      for (const blocked of blockedPaths) {
        if (path.includes(blocked)) {
          return false;
        }
      }
    }

    // If allowedPaths is set, only allow paths matching patterns
    if (allowedPaths && allowedPaths.length > 0) {
      let allowed = false;
      for (const allowedPattern of allowedPaths) {
        if (path.includes(allowedPattern) || this.matchPattern(path, allowedPattern)) {
          allowed = true;
          break;
        }
      }
      return allowed;
    }

    // Otherwise, allow by default
    return true;
  }

  private matchPattern(str: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
  }

  private mergeConfig(base: any, override: any): any {
    const result = { ...base };

    for (const key in override) {
      if (override[key] !== undefined) {
        if (typeof override[key] === 'object' && !Array.isArray(override[key]) && override[key] !== null) {
          result[key] = this.mergeConfig(base[key] || {}, override[key]);
        } else {
          result[key] = override[key];
        }
      }
    }

    return result;
  }

  async reloadConfig(): Promise<MCPConfig> {
    return this.loadConfig();
  }

  /**
   * Get configuration summary for logging
   */
  getConfigSummary(): string {
    const config = this.getConfig();
    return JSON.stringify({
      version: config.version,
      security: {
        excludeTools: config.security.excludeTools?.length || 0,
        rateLimitEnabled: config.security.rateLimit?.enabled || false,
        maxRequestsPerMinute: config.security.rateLimit?.requestsPerMinute || config.security.maxRequestsPerMinute
      },
      validation: {
        strictMode: config.validation.strictMode,
        schemasEnabled: config.validation.validateSchemas,
        toolValidationRules: Object.keys(config.validation.toolValidation || {}).length
      },
      resources: {
        cacheEnabled: config.resources?.enableCache || false,
        cacheTTL: config.resources?.cacheTTL || 0
      }
    }, null, 2);
  }

}
