/**
 * Skill Loader Tool Handler for Remix MCP Server
 * Loads skills and their resources from remote endpoints to the file manager
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import { endpointUrls } from "@remix-endpoints-helper"
import {
  ToolCategory,
  RemixToolDefinition,
  LoadSkillArgs,
  LoadSkillResult,
  ListSkillsArgs,
  ListSkillsResult,
  SkillInfo
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Skill data structure as returned from the remote endpoint
 */
interface SkillData {
  id: string;
  name: string;
  description: string;
  content: string; // SKILL.md content
  resources: Record<string, string>; // filename -> file content
}

/**
 * Skill Loader Tool Handler
 */
export class SkillLoaderHandler extends BaseToolHandler {
  name = 'load_skill';
  description = `Load a skill and its resources to the file manager under .skills folder.
  - .skills/{skill_id}/SKILL.md (main skill documentation)
  - .skills/{skill_id}/resources/{filename} (for each resource file)
  
  Returns information about the loaded skill and created files.`;

  inputSchema = {
    type: 'object',
    properties: {
      skill_id: {
        type: 'string',
        description: 'Unique identifier of the skill to load'
      }
    },
    required: ['skill_id']
  };

  getPermissions(): string[] {
    return ['file:write', 'file:create', 'network:request'];
  }

  validate(args: LoadSkillArgs): boolean | string {
    const required = this.validateRequired(args, ['skill_id']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      skill_id: 'string'
    });
    if (types !== true) return types;

    // Validate skill_id format (basic validation)
    if (args.skill_id.trim().length === 0) {
      return 'skill_id cannot be empty';
    }

    return true;
  }

  async execute(args: LoadSkillArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      console.log(`[SkillLoaderHandler] Loading skill: ${args.skill_id}`);

      const skillUrl = endpointUrls.mcpCorsProxy + '/ethskills/skills/' + args.skill_id;

      // Fetch skill data from remote endpoint
      const skillData = await this.fetchSkillData(skillUrl);

      // Create skill directory
      const skillDir = `.skills/${args.skill_id}`;
      await this.ensureDirectoryExists(skillDir, plugin);

      const createdFiles: string[] = [];

      // Write SKILL.md file
      const skillFilePath = `${skillDir}/SKILL.md`;
      await plugin.call('fileManager', 'writeFile', skillFilePath, skillData.content);
      createdFiles.push(skillFilePath);

      // Write resource files
      for (const [filename, content] of Object.entries(skillData.resources)) {
        const filePath = `${skillDir}/${filename}`;
        await plugin.call('fileManager', 'writeFile', filePath, content);
        createdFiles.push(filePath);
      }

      const result: LoadSkillResult = {
        success: true,
        path: skillDir,
        skill_id: skillData.id,
        skill_name: skillData.name,
        skill_description: skillData.description,
        files_created: createdFiles,
        total_files: createdFiles.length,
        message: `Successfully loaded skill '${skillData.name}' with ${createdFiles.length} files`,
        lastModified: new Date().toISOString()
      };

      console.log(`[SkillLoaderHandler] Successfully loaded skill ${args.skill_id} to ${skillDir}`);
      return this.createSuccessResult(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SkillLoaderHandler] Failed to load skill ${args.skill_id}:`, error);
      return this.createErrorResult(`Failed to load skill: ${errorMessage}`);
    }
  }

  /**
   * Fetch skill data from remote endpoint
   */
  private async fetchSkillData(url: string): Promise<SkillData> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.id || !data.name || !data.content || !data.resources) {
      throw new Error('Invalid skill data format - missing required fields (id, name, content, resources)');
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      content: data.content,
      resources: data.resources || {}
    };
  }

  /**
   * Ensure directory exists, create if it doesn't
   */
  private async ensureDirectoryExists(path: string, plugin: Plugin): Promise<void> {
    const exists = await plugin.call('fileManager', 'exists', path);
    if (!exists) {
      await plugin.call('fileManager', 'mkdir', path);
    }
  }
}

/**
 * Skill List Tool Handler
 */
export class ListSkillsHandler extends BaseToolHandler {
  name = 'list_skills';
  description = `List available skills.
  Returns a list of available skills with their id, name, and description.
  Use load_skill to actually download and install a specific skill.`;

  inputSchema = {
    type: 'object',
    properties: {},
    required: []
  };

  getPermissions(): string[] {
    return ['network:request'];
  }

  validate(args: ListSkillsArgs): boolean | string {
    // No validation needed since no parameters are required
    return true;
  }

  async execute(_args: ListSkillsArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      console.log(`[ListSkillsHandler] Fetching skills list`);

      const skillsUrl = endpointUrls.mcpCorsProxy + '/ethskills/skills'

      // Fetch skills list from remote endpoint
      const skills = await this.fetchSkillsList(skillsUrl);

      const result: ListSkillsResult = {
        success: true,
        skills,
        total_skills: skills.length
      };

      console.log(`[ListSkillsHandler] Successfully fetched ${skills.length} skills`);
      return this.createSuccessResult(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ListSkillsHandler] Failed to fetch skills list:`, error);
      return this.createErrorResult(`Failed to fetch skills list: ${errorMessage}`);
    }
  }

  /**
   * Fetch skills list from remote endpoint
   */
  private async fetchSkillsList(url: string): Promise<SkillInfo[]> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure - expect array of skill objects
    if (!Array.isArray(data.skills)) {
      throw new Error('Invalid skills list format - expected array of skills');
    }

    // Validate each skill object
    const skills: SkillInfo[] = [];
    for (const skill of data.skills) {
      if (!skill.id || !skill.name) {
        console.warn(`[ListSkillsHandler] Skipping invalid skill object:`, skill);
        continue;
      }

      skills.push({
        id: skill.id,
        name: skill.name,
        description: skill.description || ''
      });
    }

    return skills;
  }
}

/**
 * Create skill management tool definitions
 */
export function createSkillTools(): RemixToolDefinition[] {
  const skillLoaderHandler = new SkillLoaderHandler();
  const listSkillsHandler = new ListSkillsHandler();

  return [
    {
      name: skillLoaderHandler.name,
      description: skillLoaderHandler.description,
      inputSchema: skillLoaderHandler.inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: skillLoaderHandler.getPermissions(),
      handler: skillLoaderHandler
    },
    {
      name: listSkillsHandler.name,
      description: listSkillsHandler.description,
      inputSchema: listSkillsHandler.inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: listSkillsHandler.getPermissions(),
      handler: listSkillsHandler
    }
  ];
}
