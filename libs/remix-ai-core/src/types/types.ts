// model implementation for the model selection component

import constants from 'constants';
import { ModelType } from './constants';

export enum SupportedFileExtensions {
  solidity = 'sol',
  vyper = 'vy',
  circom = 'circom',
  noir = 'nr',
  cairo = 'cairo',
  javascript = 'js',
  typescript = 'ts',
  tests_ts = 'test.ts',
  tests_js = 'test.js',
}

export enum ImportExtractionSupportedFileExtensions {
  solidity = 'sol',
}

export interface IExtractedImport {
  importPath: string;
  content: string;
  isLocal: boolean;
  isLibrary: boolean;
}

export interface IContextType {
  context: 'currentFile' | 'workspace'|'openedFiles' | 'none'
  files?: { fileName: string; content: string }[]
}

export interface ISimilaritySearchConfig {
  maxFiles?: number;
  similarityThreshold?: number;
  enabled?: boolean;
}

export interface IRemoteModel {
  completionUrl: string;
  apiUrl: string;
}

export interface ICompletions{
  code_completion(prompt, context, ctxFiles, fileName, params:IParams): Promise<any>;
  code_insertion(msg_pfx, msg_sfx, ctxFiles, fileName, params:IParams): Promise<any>;
}
export interface IGeneration{
  code_generation(prompt, params:IParams): Promise<any>;
  code_explaining(prompt, context:string, params:IParams): Promise<any>;
  error_explaining(prompt, params:IParams): Promise<any>;
  answer(prompt, params:IParams): Promise<any>;
  generate(prompt, params:IParams): Promise<any>;
  generateWorkspace(prompt, params:IParams): Promise<any>;
  vulnerability_check(prompt, params:IParams): Promise<any>;
}

export interface IParams {
  temperature?: number;
  max_new_tokens?: number;
  max_tokens?: number;
  repetition_penalty?: number;
  repeat_penalty?:any
  no_repeat_ngram_size?: number;
  num_beams?: number;
  num_return_sequences?: number;
  top_k?: number;
  top_p?: number;
  stream_result?: boolean;
  return_full_text?: boolean;
  nThreads?: number;
  nTokPredict?: number;
  topK?: number;
  topP?: number;
  temp?: number;
  return_stream_response?: boolean;
  terminal_output?: boolean;
  threadId?: string;
  provider?: string;
  stream?: boolean;
  model?: string;
  stop?: string[];
  chatHistory?: any[];
  version: string;
  tools?: any[];
  tool_choice?: string;
  toolsMessages?: any[];
  format?: string;
}

export interface IAIStreamResponse{
  streamResponse: any,
  callback?: any,
  toolExecutionStatusCallback?: (isExecuting: boolean, toolName?: string, toolArgs?: Record<string, any>) => void
}

export enum AIRequestType {
  COMPLETION,
  GENERAL
}

export type ChatEntry = [string, string];

interface GeneratedTextObject {
  generatedText: string;
  isGenerating: boolean;
}
export class JsonStreamParser {
  buffer: string
  constructor() {
    this.buffer = '';
  }

  safeJsonParse<T>(chunk: string): T[] | null {
    this.buffer += chunk;
    const results = [];
    let startIndex = 0;
    let endIndex: number;
    while ((endIndex = this.buffer.indexOf('}', startIndex)) !== -1) {
      // check if next character is an opening curly bracket
      let modifiedEndIndex = endIndex;
      if ((modifiedEndIndex = this.buffer.indexOf('{', endIndex)) !== -1 ) {
        endIndex = modifiedEndIndex - 1;
      }

      if (((modifiedEndIndex = this.buffer.indexOf('{', endIndex)) === -1) &&
          (this.buffer.indexOf('}', endIndex) < this.buffer.length)) {
        endIndex = this.buffer.indexOf('}', endIndex+1) <0 ? this.buffer.length - 1 : this.buffer.indexOf('}', endIndex+1);
      }

      const jsonStr = this.buffer.slice(startIndex, endIndex + 1);
      try {
        const obj: GeneratedTextObject = JSON.parse(jsonStr);
        results.push(obj);
      } catch (error) {
        console.error('Error parsing JSON:', error);
      }
      startIndex = endIndex + 1;
    }
    this.buffer = this.buffer.slice(startIndex);
    return results;
  }

  safeJsonParseSingle<T>(chunk: string): T[] | null {
    return JSON.parse(this.buffer);
  }
}

export interface CompilationResult {
  compilationSucceeded: boolean
  errors: string
  errfiles?: { [key: string]: any }
  compilerPayload?: any
}
