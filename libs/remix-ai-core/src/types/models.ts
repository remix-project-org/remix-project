import { IParams } from './types';

// Model Registry for User-Access-Based Selection
export interface AIModel {
  id: string // Unique model ID (e.g., 'gpt-4-turbo')
  name: string // Display name (e.g., 'GPT-4 Turbo')
  provider: 'openai' | 'mistralai' | 'anthropic' | 'ollama'
  description: string // Short description
  requiresAuth: boolean // Does it require login?
  isDefault: boolean // Is it the base free model?
  category: 'coding' | 'general' | 'local'
  capabilities: string[] // e.g., ['code', 'chat', 'completion']
}

export const AVAILABLE_MODELS: AIModel[] = [
  // Default free model (no auth required)
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small (Free)',
    provider: 'mistralai',
    description: 'Fast and efficient for basic tasks',
    requiresAuth: false,
    isDefault: true,
    category: 'general',
    capabilities: ['chat', 'code']
  },

  // Premium models (require auth + access)
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'Optimized for speed and performance',
    requiresAuth: true,
    isDefault: false,
    category: 'coding',
    capabilities: ['chat', 'code', 'completion']
  },
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    description: 'Best for complex Solidity contracts',
    requiresAuth: true,
    isDefault: false,
    category: 'coding',
    capabilities: ['chat', 'code', 'completion']
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    description: 'Balanced performance and speed',
    requiresAuth: true,
    isDefault: false,
    category: 'coding',
    capabilities: ['chat', 'code', 'completion']
  },
  {
    id: 'mistral-medium-latest',
    name: 'Mistral Large',
    provider: 'mistralai',
    description: 'Advanced coding assistance',
    requiresAuth: true,
    isDefault: false,
    category: 'coding',
    capabilities: ['chat', 'code', 'completion']
  },
  {
    id: 'codestral-latest',
    name: 'Codestral',
    provider: 'mistralai',
    description: 'Specialized for code generation',
    requiresAuth: true,
    isDefault: false,
    category: 'coding',
    capabilities: ['code', 'completion']
  },

  // Special local models entry
  {
    id: 'ollama',
    name: 'Local Models (Ollama)',
    provider: 'ollama',
    description: 'Run AI models locally on your machine',
    requiresAuth: false,
    isDefault: false,
    category: 'local',
    capabilities: ['chat', 'code', 'completion']
  }
]

// Helper function to get default model
export function getDefaultModel(): AIModel {
  return AVAILABLE_MODELS.find(m => m.isDefault) || AVAILABLE_MODELS[0]
}

// Helper to get model by ID
export function getModelById(id: string): AIModel | undefined {
  return AVAILABLE_MODELS.find(m => m.id === id)
}

const CompletionParams:IParams = {
  temperature: 0.8,
  topK: 40,
  topP: 0.92,
  max_new_tokens: 15,
  stream_result: false,
  max_tokens: 200,
  version: '1.0.0'
}

const InsertionParams:IParams = {
  temperature: 0.8,
  topK: 40,
  topP: 0.92,
  max_new_tokens: 150,
  stream_result: false,
  stream: false,
  model: "",
  version: '1.0.0',
}

const GenerationParams:IParams = {
  temperature: 0.5,
  topK: 40,
  topP: 0.92,
  max_new_tokens: 20000,
  stream_result: false,
  stream: false,
  model: "",
  repeat_penalty: 1.2,
  terminal_output: false,
  version: '1.0.0',
}

const AssistantParams:IParams = GenerationParams
AssistantParams.provider = 'mistralai' // default provider

export { CompletionParams, InsertionParams, GenerationParams, AssistantParams }
