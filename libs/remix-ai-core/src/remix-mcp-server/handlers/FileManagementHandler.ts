/**
 * File Management Tool Handlers for Remix MCP Server
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition,
  FileReadArgs,
  FileWriteArgs,
  FileCreateArgs,
  FileDeleteArgs,
  FileMoveArgs,
  FileCopyArgs,
  DirectoryListArgs,
  FileOperationResult,
  FileReplacerArgs,
  FileReadChunkArgs,
  FileReadChunkResult,
  FileGrepArgs,
  FileGrepResult
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * File Read Tool Handler
 */
export class FileReadHandler extends BaseToolHandler {
  name = 'file_read';
  description = `Read contents of a file
  Returns an object with content (string) and metadata. Pay attention: to get the actual string value from the tool output you will have to do: JSON.parse(toolOutput.content[0].text).payload
  {
    success: boolean,
    path: string,
    payload: string,
    size: number
  }`
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to read'
      }
    },
    required: ['path']
  };

  getPermissions(): string[] {
    return ['file:read'];
  }

  validate(args: FileReadArgs): boolean | string {
    const required = this.validateRequired(args, ['path']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { path: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: FileReadArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const exists = await plugin.call('fileManager', 'exists', args.path)
      if (!exists) {
        return this.createErrorResult(`File not found: ${args.path}`);
      }

      const content = await plugin.call('fileManager', 'readFile', args.path)

      const result: FileOperationResult = {
        success: true,
        path: args.path,
        payload: content,
        size: content.length
      }
      return this.createSuccessResult(result)
    } catch (error) {
      return this.createErrorResult(`Failed to read file: ${error.message}`)
    }
  }
}

/**
 * File Read Tool Handler
 */
export class FileReplacerHandler extends BaseToolHandler {
  name = 'file_replace';
  description = `Replace content in a file`
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to replace content in'
      },
      regEx: {
        type: 'string',
        description: 'Regular expression pattern to match content to replace'
      },
      contentToReplace: {
        type: 'string',
        description: 'New content to replace with'
      }
    },
    required: ['path', 'regEx', 'contentToReplace']
  };

  getPermissions(): string[] {
    return ['file:write'];
  }

  validate(args: any): boolean | string {
    const required = this.validateRequired(args, ['path', 'regEx', 'contentToReplace']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { path: 'string', regEx: 'string', contentToReplace: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: FileReplacerArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      console.log(`[FileReplacerHandler] - Replacing content in file: ${args.path} using regex: ${args.regEx}`);
      const exists = await plugin.call('fileManager', 'exists', args.path)
      if (!exists) {
        return this.createErrorResult(`File not found: ${args.path}`);
      }

      const originContent = await plugin.call('fileManager', 'readFile', args.path)

      const content = originContent.replace(new RegExp(args.regEx, 'g'), args.contentToReplace)

      // make sure the LLM has actually updated the content if that is intended.
      const cleanContent = typeof content === 'string' ? content : String(content)
      if (cleanContent === originContent && originContent !== '') {
        return this.createErrorResult(`File content is the same as the current content. No changes made to: ${args.path} . Is that intended? If not, makre sure the content you are passing is different from the existing content.`);
      }
      await plugin.call('editor', 'showCustomDiff', args.path, cleanContent)

      const result: any = {
        success: true
      }
      return this.createSuccessResult(result)
    } catch (error) {
      return this.createErrorResult(`Failed to replace content in file: ${error.message}`)
    }
  }
}

/**
 * File Write Tool Handler
 */
export class FileWriteHandler extends BaseToolHandler {
  name = 'file_write';
  description = `Write content to a file.
  Always wrap string with a backquote to avoid issues with special characters in the content and to ensure multiline content is properly handled.`
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to write'
      },
      content: {
        type: 'string',
        description: 'Content to write to the file'
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf8)',
        default: 'utf8'
      }
    },
    required: ['path', 'content']
  };

  getPermissions(): string[] {
    return ['file:write'];
  }

  validate(args: FileWriteArgs): boolean | string {
    const required = this.validateRequired(args, ['path', 'content']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      path: 'string',
      content: 'string',
      encoding: 'string'
    });
    if (types !== true) return types;

    return true;
  }

  async execute(args: FileWriteArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const exists = await plugin.call('fileManager', 'exists', args.path)
      if (exists) {
        const hasUnacceptedChanges = await plugin.call('editor', 'hasUnacceptedChanges')
        console.log(`[FileWriteHandler] - File ${args.path} already exists. Checking for unaccepted changes: ${hasUnacceptedChanges}`);
        if (hasUnacceptedChanges) {
          return this.createErrorResult(`Project has unaccepted changes. Please review and accept/reject changes before overwriting.`);
        }
      }
      try {
        if (!exists) {await plugin.call('fileManager', 'writeFile', args.path, "")}
        await plugin.call('fileManager', 'open', args.path)
      } catch (openError) {
        console.warn(`Failed to open file in editor: ${openError.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 300))

      // make sure the LLM has actually updated the content if that is intended.
      const currentContent = await plugin.call('fileManager', 'readFile', args.path)
      const cleanContent = typeof args.content === 'string' ? args.content : String(args.content)
      if (cleanContent === currentContent && currentContent !== '') {
        return this.createErrorResult(`File content is the same as the current content. No changes made to: ${args.path} . Is that intended? If not, makre sure the content you are passing is different from the existing content.`);
      }
      await plugin.call('editor', 'showCustomDiff', args.path, cleanContent)

      const result: FileOperationResult = {
        success: true,
        path: args.path,
        message: 'File written successfully',
        lastModified: new Date().toISOString()
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to write file: ${error.message}`);
    }
  }
}

/**
 * File Create Tool Handler
 */
export class FileCreateHandler extends BaseToolHandler {
  name = 'file_create';
  description = 'Create a new file or directory';
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path for the new file or directory'
      },
      content: {
        type: 'string',
        description: 'Initial content for the file (optional)',
        default: ''
      },
      type: {
        type: 'string',
        enum: ['file', 'directory'],
        description: 'Type of item to create',
        default: 'file'
      }
    },
    required: ['path']
  };

  getPermissions(): string[] {
    return ['file:create'];
  }

  validate(args: FileCreateArgs): boolean | string {
    const required = this.validateRequired(args, ['path']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      path: 'string',
      content: 'string',
      type: 'string'
    });
    if (types !== true) return types;

    if (args.type && !['file', 'directory'].includes(args.type)) {
      return 'Invalid type: must be "file" or "directory"';
    }

    return true;
  }

  async execute(args: FileCreateArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const exists = await plugin.call('fileManager', 'exists', args.path)
      if (exists) {
        return this.createErrorResult(`Path already exists: ${args.path}`);
      }

      if (args.type === 'directory') {
        await plugin.call('fileManager', 'mkdir', args.path);
      } else {
        await plugin.call('fileManager', 'writeFile', args.path, '');
        await plugin.call('fileManager', 'open', args.path)
        await new Promise(resolve => setTimeout(resolve, 300))

        const cleanContent = typeof args.content === 'string' ? args.content : String(args.content || '')
        await plugin.call('editor', 'showCustomDiff', args.path, cleanContent)
      }

      const result: FileOperationResult = {
        success: true,
        path: args.path,
        message: `${args.type === 'directory' ? 'Directory' : 'File'} created successfully`,
        lastModified: new Date().toISOString()
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to create ${args.type || 'file'}: ${error.message}`);
    }
  }
}

/**
 * File Delete Tool Handler
 */
export class FileDeleteHandler extends BaseToolHandler {
  name = 'file_delete';
  description = 'Delete a file or directory';
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path of the file or directory to delete'
      }
    },
    required: ['path']
  };

  getPermissions(): string[] {
    return ['file:delete'];
  }

  validate(args: FileDeleteArgs): boolean | string {
    const required = this.validateRequired(args, ['path']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { path: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: FileDeleteArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const exists = await plugin.call('fileManager', 'exists', args.path)
      if (!exists) {
        return this.createErrorResult(`Path not found: ${args.path}`);
      }

      await plugin.call('fileManager', 'remove', args.path);

      const result: FileOperationResult = {
        success: true,
        path: args.path,
        message: 'Path deleted successfully'
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to delete: ${error.message}`);
    }
  }
}

/**
 * File Move Tool Handler
 */
export class FileMoveHandler extends BaseToolHandler {
  name = 'file_move';
  description = 'Move or rename a file or directory';
  inputSchema = {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Source path'
      },
      to: {
        type: 'string',
        description: 'Destination path'
      }
    },
    required: ['from', 'to']
  };

  getPermissions(): string[] {
    return ['file:move'];
  }

  validate(args: FileMoveArgs): boolean | string {
    const required = this.validateRequired(args, ['from', 'to']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { from: 'string', to: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: FileMoveArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const exists = await plugin.call('fileManager', 'exists', args.from);
      if (!exists) {
        return this.createErrorResult(`Source path not found: ${args.from}`);
      }

      const destExists = await plugin.call('fileManager', 'exists', args.to);
      if (destExists) {
        return this.createErrorResult(`Destination path already exists: ${args.to}`);
      }

      await plugin.call('fileManager', 'rename', args.from, args.to);

      const result: FileOperationResult = {
        success: true,
        path: args.to,
        message: `Moved from ${args.from} to ${args.to}`,
        lastModified: new Date().toISOString()
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to move: ${error.message}`);
    }
  }
}

/**
 * File Copy Tool Handler
 */
export class FileCopyHandler extends BaseToolHandler {
  name = 'file_copy';
  description = 'Copy a file or directory';
  inputSchema = {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Source path'
      },
      to: {
        type: 'string',
        description: 'Destination path'
      }
    },
    required: ['from', 'to']
  };

  getPermissions(): string[] {
    return ['file:copy'];
  }

  validate(args: FileCopyArgs): boolean | string {
    const required = this.validateRequired(args, ['from', 'to']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { from: 'string', to: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: FileCopyArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const exists = await plugin.call('fileManager', 'exists', args.from);
      if (!exists) {
        return this.createErrorResult(`Source path not found: ${args.from}`);
      }

      const content = await plugin.call('fileManager', 'readFile',args.from);
      await plugin.call('fileManager', 'writeFile',args.to, content);

      const result: FileOperationResult = {
        success: true,
        path: args.to,
        message: `Copied from ${args.from} to ${args.to}`,
        size: content.length,
        lastModified: new Date().toISOString()
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to copy: ${error.message}`);
    }
  }
}

/**
 * Directory List Tool Handler
 */
export class DirectoryListHandler extends BaseToolHandler {
  name = 'directory_list';
  description = 'List contents of a directory';
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list'
      },
      recursive: {
        type: 'boolean',
        description: 'List recursively',
        default: false
      }
    },
    required: ['path']
  };

  getPermissions(): string[] {
    return ['file:read'];
  }

  validate(args: DirectoryListArgs): boolean | string {
    const required = this.validateRequired(args, ['path']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { path: 'string', recursive: 'boolean' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: DirectoryListArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const exists = await plugin.call('fileManager', 'exists', args.path)
      if (!exists) {
        return this.createErrorResult(`Directory not found: ${args.path}`);
      }

      const files = await plugin.call('fileManager', 'readdir', args.path);
      const fileList = [];

      for (const file in files) {
        // Remix readdir may return keys that already include the parent path
        // e.g. readdir('contracts') → { "contracts/1_Storage.sol": ... }
        const fullPath = file.startsWith(args.path + '/') || file.startsWith(args.path + '\\')
          ? file
          : `${args.path}/${file}`;
        try {
          const isDir = await plugin.call('fileManager', 'isDirectory', fullPath);
          let size = 0;

          if (!isDir) {
            const content = await plugin.call('fileManager', 'readFile', fullPath);
            size = content.length;
          }

          fileList.push({
            name: file,
            path: fullPath,
            isDirectory: isDir,
            size: size
          });

          // Recursive listing
          if (args.recursive && isDir) {
            const subFiles = await this.execute({ path: fullPath, recursive: true }, plugin);
            if (!subFiles.isError && subFiles.content[0]?.text) {
              const subResult = JSON.parse(subFiles.content[0].text);
              if (subResult.files) {
                fileList.push(...subResult.files);
              }
            }
          }
        } catch (error) {
          // Skip files that can't be accessed
        }
      }

      const result = {
        success: true,
        path: args.path,
        files: fileList,
        count: fileList.length
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to list directory: ${error.message}`);
    }
  }
}

/**
 * File Read Chunk Tool Handler
 */
export class FileReadChunkHandler extends BaseToolHandler {
  name = 'read_file_chunk';
  description = `Read a chunk of lines from a file with pagination support.
  Returns an object with content and metadata about the chunk position.
  {
    success: boolean,
    path: string,
    content: string,
    startLine: number,
    endLine: number,
    totalLines: number,
    hasMore: boolean
  }`
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to read'
      },
      offset: {
        type: 'number',
        description: 'Starting line number (0-based, default: 0)',
        default: 0
      },
      limit: {
        type: 'number',
        description: 'Number of lines to read (default: 100)',
        default: 100
      }
    },
    required: ['path']
  };

  getPermissions(): string[] {
    return ['file:read'];
  }

  validate(args: FileReadChunkArgs): boolean | string {
    const required = this.validateRequired(args, ['path']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      path: 'string',
      offset: 'number',
      limit: 'number'
    });
    if (types !== true) return types;

    if (args.offset !== undefined && args.offset < 0) {
      return 'offset must be non-negative';
    }

    if (args.limit !== undefined && args.limit <= 0) {
      return 'limit must be positive';
    }

    return true;
  }

  async execute(args: FileReadChunkArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const exists = await plugin.call('fileManager', 'exists', args.path);
      if (!exists) {
        return this.createErrorResult(`File not found: ${args.path}`);
      }

      const content = await plugin.call('fileManager', 'readFile', args.path);
      const lines = content.split('\n');
      const totalLines = lines.length;

      const offset = args.offset || 0;
      const limit = args.limit || 100;

      if (offset >= totalLines) {
        return this.createErrorResult(`Offset ${offset} exceeds file length ${totalLines}`);
      }

      const endIndex = Math.min(offset + limit, totalLines);
      const chunkLines = lines.slice(offset, endIndex);
      const chunkContent = chunkLines.join('\n');

      const result: FileReadChunkResult = {
        success: true,
        path: args.path,
        content: chunkContent,
        startLine: offset,
        endLine: endIndex - 1,
        totalLines: totalLines,
        hasMore: endIndex < totalLines
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to read file chunk: ${error.message}`);
    }
  }
}

/**
 * File Grep Tool Handler
 */
export class FileGrepHandler extends BaseToolHandler {
  name = 'grep_file';
  description = `Search for pattern matches within a file using regular expressions.
  Returns matching lines with optional context and line numbers.
  {
    success: boolean,
    path: string,
    pattern: string,
    matches: Array<{
      lineNumber: number,
      line: string,
      contextBefore?: string[],
      contextAfter?: string[]
    }>,
    totalMatches: number,
    truncated: boolean
  }`
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to search in'
      },
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for'
      },
      ignoreCase: {
        type: 'boolean',
        description: 'Case-insensitive matching (default: false)',
        default: false
      },
      lineNumbers: {
        type: 'boolean',
        description: 'Include line numbers in results (default: true)',
        default: true
      },
      contextBefore: {
        type: 'number',
        description: 'Number of context lines before each match (default: 0)',
        default: 0
      },
      contextAfter: {
        type: 'number',
        description: 'Number of context lines after each match (default: 0)',
        default: 0
      },
      maxMatches: {
        type: 'number',
        description: 'Maximum number of matches to return (default: 50)',
        default: 50
      }
    },
    required: ['path', 'pattern']
  };

  getPermissions(): string[] {
    return ['file:read'];
  }

  validate(args: FileGrepArgs): boolean | string {
    const required = this.validateRequired(args, ['path', 'pattern']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      path: 'string',
      pattern: 'string',
      ignoreCase: 'boolean',
      lineNumbers: 'boolean',
      contextBefore: 'number',
      contextAfter: 'number',
      maxMatches: 'number'
    });
    if (types !== true) return types;

    if (args.contextBefore !== undefined && args.contextBefore < 0) {
      return 'contextBefore must be non-negative';
    }

    if (args.contextAfter !== undefined && args.contextAfter < 0) {
      return 'contextAfter must be non-negative';
    }

    if (args.maxMatches !== undefined && args.maxMatches <= 0) {
      return 'maxMatches must be positive';
    }

    // Test if pattern is valid regex
    try {
      new RegExp(args.pattern, args.ignoreCase ? 'i' : '');
    } catch (error) {
      return `Invalid regular expression: ${error.message}`;
    }

    return true;
  }

  async execute(args: FileGrepArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const exists = await plugin.call('fileManager', 'exists', args.path);
      if (!exists) {
        return this.createErrorResult(`File not found: ${args.path}`);
      }

      const content = await plugin.call('fileManager', 'readFile', args.path);
      const lines = content.split('\n');

      const flags = args.ignoreCase ? 'gi' : 'g';
      const regex = new RegExp(args.pattern, flags);

      const matches = [];
      const contextBefore = args.contextBefore || 0;
      const contextAfter = args.contextAfter || 0;
      const maxMatches = args.maxMatches || 50;

      for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
        const line = lines[i];
        if (regex.test(line)) {
          const match: any = {
            lineNumber: i + 1, // 1-based line numbers
            line: line
          };

          // Add context before
          if (contextBefore > 0) {
            const beforeStart = Math.max(0, i - contextBefore);
            match.contextBefore = lines.slice(beforeStart, i);
          }

          // Add context after
          if (contextAfter > 0) {
            const afterEnd = Math.min(lines.length, i + contextAfter + 1);
            match.contextAfter = lines.slice(i + 1, afterEnd);
          }

          matches.push(match);
        }
      }

      const result: FileGrepResult = {
        success: true,
        path: args.path,
        pattern: args.pattern,
        matches: matches,
        totalMatches: matches.length,
        truncated: matches.length >= maxMatches
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to grep file: ${error.message}`);
    }
  }
}

/**
 * File Exists Tool Handler
 */
export class FileExistsHandler extends BaseToolHandler {
  name = 'file_exists';
  description = 'Check if a file or directory exists';
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to check'
      }
    },
    required: ['path']
  };

  getPermissions(): string[] {
    return ['file:read'];
  }

  validate(args: { path: string }): boolean | string {
    const required = this.validateRequired(args, ['path']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { path: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: { path: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const exists = await plugin.call('fileManager', 'exists', args.path)

      const result = {
        success: true,
        path: args.path,
        exists: exists
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to check file existence: ${error.message}`);
    }
  }
}

/**
 * Create file management tool definitions
 */
export function createFileManagementTools(): RemixToolDefinition[] {
  const fileReadHandler = new FileReadHandler();
  const fileWriteHandler = new FileWriteHandler();
  const fileCreateHandler = new FileCreateHandler();
  const fileDeleteHandler = new FileDeleteHandler();
  const fileMoveHandler = new FileMoveHandler();
  const fileCopyHandler = new FileCopyHandler();
  const directoryListHandler = new DirectoryListHandler();
  const fileExistsHandler = new FileExistsHandler();
  const fileReplacerHandler = new FileReplacerHandler();
  const fileReadChunkHandler = new FileReadChunkHandler();
  const fileGrepHandler = new FileGrepHandler();

  return [
    {
      name: fileReadHandler.name,
      description: fileReadHandler.description,
      inputSchema: fileReadHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: fileReadHandler.getPermissions(),
      handler: fileReadHandler
    },
    {
      name: fileWriteHandler.name,
      description: fileWriteHandler.description,
      inputSchema: fileWriteHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: fileWriteHandler.getPermissions(),
      handler: fileWriteHandler
    },
    {
      name: fileCreateHandler.name,
      description: fileCreateHandler.description,
      inputSchema: fileCreateHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: fileCreateHandler.getPermissions(),
      handler: fileCreateHandler
    },
    {
      name: fileDeleteHandler.name,
      description: fileDeleteHandler.description,
      inputSchema: fileDeleteHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: fileDeleteHandler.getPermissions(),
      handler: fileDeleteHandler
    },
    {
      name: fileMoveHandler.name,
      description: fileMoveHandler.description,
      inputSchema: fileMoveHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: fileMoveHandler.getPermissions(),
      handler: fileMoveHandler
    },
    {
      name: fileCopyHandler.name,
      description: fileCopyHandler.description,
      inputSchema: fileCopyHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: fileCopyHandler.getPermissions(),
      handler: fileCopyHandler
    },
    {
      name: directoryListHandler.name,
      description: directoryListHandler.description,
      inputSchema: directoryListHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: directoryListHandler.getPermissions(),
      handler: directoryListHandler
    },
    {
      name: fileExistsHandler.name,
      description: fileExistsHandler.description,
      inputSchema: fileExistsHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: fileExistsHandler.getPermissions(),
      handler: fileExistsHandler
    },
    {
      name: fileReplacerHandler.name,
      description: fileReplacerHandler.description,
      inputSchema: fileReplacerHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: fileReplacerHandler.getPermissions(),
      handler: fileReplacerHandler
    },
    {
      name: fileReadChunkHandler.name,
      description: fileReadChunkHandler.description,
      inputSchema: fileReadChunkHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: fileReadChunkHandler.getPermissions(),
      handler: fileReadChunkHandler
    },
    {
      name: fileGrepHandler.name,
      description: fileGrepHandler.description,
      inputSchema: fileGrepHandler.inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: fileGrepHandler.getPermissions(),
      handler: fileGrepHandler
    }
  ];
}