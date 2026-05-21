import { IParams } from './types';

// Model Registry for User-Access-Based Selection
export interface AIModel {
  id: string // Unique model ID (e.g., 'gpt-4-turbo')
  name: string // Display name (e.g., 'GPT-4 Turbo')
  provider: 'openai' | 'mistralai' | 'anthropic' | 'moonshot' | 'ollama'
  description: string // Short description
  requiresAuth: boolean // Does it require login?
  isDefault: boolean // Is it the base free model?
  category: 'coding' | 'general' | 'local'
  capabilities: string[] // e.g., ['code', 'chat', 'completion']
}

export const AVAILABLE_MODELS: AIModel[] = [
  // Default free model (no auth required)
  {
    id: 'mistral-medium-latest',
    name: 'Mistral Medium (Free)',
    provider: 'mistralai',
    description: 'Fast and efficient for basic tasks',
    requiresAuth: false,
    isDefault: false,
    category: 'general',
    capabilities: ['chat', 'code']
  },
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
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    description: 'Best for complex web3 contracts',
    requiresAuth: true,
    isDefault: false,
    category: 'coding',
    capabilities: ['chat', 'code', 'completion']
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: 'Balanced performance and speed',
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

  // OpenAI models
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'openai',
    description: 'Latest OpenAI flagship model',
    requiresAuth: true,
    isDefault: false,
    category: 'coding',
    capabilities: ['chat', 'code', 'completion']
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'openai',
    description: 'Fast and efficient OpenAI model',
    requiresAuth: true,
    isDefault: false,
    category: 'coding',
    capabilities: ['chat', 'code', 'completion']
  },

  // Moonshot/Kimi models
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    provider: 'moonshot',
    description: 'Moonshot Kimi K2 model',
    requiresAuth: true,
    isDefault: false,
    category: 'coding',
    capabilities: ['chat', 'code', 'completion']
  },
  {
    id: 'moonshot-v1-128k',
    name: 'Moonshot v1 (128K)',
    provider: 'moonshot',
    description: 'Moonshot v1 with 128K context',
    requiresAuth: true,
    isDefault: false,
    category: 'coding',
    capabilities: ['chat', 'code', 'completion']
  },

  // Special local models entry (temporarily disabled - will re-enable later)
  // {
  //   id: 'ollama',
  //   name: 'Local Models (Ollama)',
  //   provider: 'ollama',
  //   description: 'Run AI models locally on your machine',
  //   requiresAuth: false,
  //   isDefault: false,
  //   category: 'local',
  //   capabilities: ['chat', 'code', 'completion']
  // }
]

export const MODEL_PRICING = [
  {
    "type":"header",
    "version":"5.2.3",
    "comment":"Export to JSON plugin for phpMyAdmin"
  },
  {
    "type":"database",
    "name":"remix"
  },
  {
    "type":"table",
    "name":"ai_model_pricing",
    "database":"remix",
    "data":[
      {
        "id":"35",
        "provider":"mistralai",
        "model":"mistral-small-latest",
        "display_name":"Mistral Small",
        "description":"Fast and efficient for basic tasks",
        "category":"general",
        "capabilities":"[\"chat\",\"code\"]",
        "is_default":"1",
        "requires_auth":"1",
        "sort_order":"10",
        "required_feature":"ai:mistral-small",
        "input_cost_per_1m_usd":"0.500000",
        "output_cost_per_1m_usd":"0.600000",
        "cache_creation_cost_per_1m_usd":"0.000000",
        "cache_creation_1h_cost_per_1m_usd":"0.000000",
        "cache_read_cost_per_1m_usd":"0.000000",
        "input_credits_per_1m":"5000",
        "output_credits_per_1m":"6000",
        "cache_creation_credits_per_1m":"0",
        "cache_creation_1h_credits_per_1m":"0",
        "cache_read_credits_per_1m":"0",
        "active":"1",
        "notes":null,
        "created_at":"2026-05-10 11:47:02.133",
        "updated_at":"2026-05-15 08:01:26.415"
      },
      {
        "id":"36",
        "provider":"mistralai",
        "model":"mistral-medium-latest",
        "display_name":"Mistral Medium",
        "description":"Fast and efficient for basic tasks",
        "category":"general",
        "capabilities":"[\"chat\",\"code\"]",
        "is_default":"0",
        "requires_auth":"1",
        "sort_order":"20",
        "required_feature":"ai:mistral-medium",
        "input_cost_per_1m_usd":"1.500000",
        "output_cost_per_1m_usd":"7.500000",
        "cache_creation_cost_per_1m_usd":"0.000000",
        "cache_creation_1h_cost_per_1m_usd":"0.000000",
        "cache_read_cost_per_1m_usd":"0.000000",
        "input_credits_per_1m":"15000",
        "output_credits_per_1m":"7500",
        "cache_creation_credits_per_1m":"0",
        "cache_creation_1h_credits_per_1m":"0",
        "cache_read_credits_per_1m":"0",
        "active":"1",
        "notes":null,
        "created_at":"2026-05-10 11:47:02.147",
        "updated_at":"2026-05-15 08:01:04.930"
      },
      {
        "id":"37",
        "provider":"mistralai",
        "model":"codestral-latest",
        "display_name":"Codestral",
        "description":"Specialized for code generation",
        "category":"coding",
        "capabilities":"[\"code\", \"completion\"]",
        "is_default":"0",
        "requires_auth":"1",
        "sort_order":"30",
        "required_feature":"ai:codestral",
        "input_cost_per_1m_usd":"0.300000",
        "output_cost_per_1m_usd":"0.900000",
        "cache_creation_cost_per_1m_usd":"0.000000",
        "cache_creation_1h_cost_per_1m_usd":"0.000000",
        "cache_read_cost_per_1m_usd":"0.000000",
        "input_credits_per_1m":"3000",
        "output_credits_per_1m":"9000",
        "cache_creation_credits_per_1m":"0",
        "cache_creation_1h_credits_per_1m":"0",
        "cache_read_credits_per_1m":"0",
        "active":"1",
        "notes":null,
        "created_at":"2026-05-10 11:47:02.152",
        "updated_at":"2026-05-10 11:47:02.152"
      },
      {
        "id":"38",
        "provider":"anthropic",
        "model":"claude-sonnet-4-6",
        "display_name":"Claude Sonnet 4.6",
        "description":"Balanced performance and speed",
        "category":"coding",
        "capabilities":"[\"chat\", \"code\", \"completion\"]",
        "is_default":"0",
        "requires_auth":"1",
        "sort_order":"40",
        "required_feature":"ai:sonnet-4.6",
        "input_cost_per_1m_usd":"3.000000",
        "output_cost_per_1m_usd":"15.000000",
        "cache_creation_cost_per_1m_usd":"3.750000",
        "cache_creation_1h_cost_per_1m_usd":"6.000000",
        "cache_read_cost_per_1m_usd":"0.300000",
        "input_credits_per_1m":"30000",
        "output_credits_per_1m":"150000",
        "cache_creation_credits_per_1m":"37500",
        "cache_creation_1h_credits_per_1m":"60000",
        "cache_read_credits_per_1m":"3000",
        "active":"1",
        "notes":null,
        "created_at":"2026-05-10 11:47:02.156",
        "updated_at":"2026-05-14 15:53:42.852"
      },
      {
        "id":"39",
        "provider":"anthropic",
        "model":"claude-opus-4-6",
        "display_name":"Claude Opus 4.6",
        "description":"Best for complex web3 contracts",
        "category":"coding",
        "capabilities":"[\"chat\", \"code\", \"completion\"]",
        "is_default":"0",
        "requires_auth":"1",
        "sort_order":"50",
        "required_feature":"ai:opus-4.6",
        "input_cost_per_1m_usd":"5.000000",
        "output_cost_per_1m_usd":"25.000000",
        "cache_creation_cost_per_1m_usd":"6.250000",
        "cache_creation_1h_cost_per_1m_usd":"10.000000",
        "cache_read_cost_per_1m_usd":"0.500000",
        "input_credits_per_1m":"50000",
        "output_credits_per_1m":"250000",
        "cache_creation_credits_per_1m":"62500",
        "cache_creation_1h_credits_per_1m":"100000",
        "cache_read_credits_per_1m":"5000",
        "active":"1",
        "notes":" | corrected to 4.6 rates 2026-05-14",
        "created_at":"2026-05-10 11:47:02.157",
        "updated_at":"2026-05-14 15:53:42.852"
      },
      {
        "id":"41",
        "provider":"moonshot",
        "model":"kimi-k2.6",
        "display_name":"Kimi K2.6",
        "description":"Latest multimodal model with strong long-context code writing, thinking\/non-thinking modes, text+image+video input, 256k context",
        "category":"chat",
        "capabilities":"[\"chat\",\"code\",\"vision\",\"agent\"]",
        "is_default":"0",
        "requires_auth":"1",
        "sort_order":"60",
        "required_feature":"ai:kimi-k2.6",
        "input_cost_per_1m_usd":"0.950000",
        "output_cost_per_1m_usd":"4.000000",
        "cache_creation_cost_per_1m_usd":"0.000000",
        "cache_creation_1h_cost_per_1m_usd":"0.000000",
        "cache_read_cost_per_1m_usd":"0.160000",
        "input_credits_per_1m":"9500",
        "output_credits_per_1m":"40000",
        "cache_creation_credits_per_1m":"0",
        "cache_creation_1h_credits_per_1m":"0",
        "cache_read_credits_per_1m":"1600",
        "active":"1",
        "notes":null,
        "created_at":"2026-05-16 14:45:18.379",
        "updated_at":"2026-05-16 14:50:11.625"
      },
      {
        "id":"44",
        "provider":"anthropic",
        "model":"haiku-4-6",
        "display_name":"Haiku 4.6",
        "description":null,
        "category":"general",
        "capabilities":"[\"chat\",\"code\",\"tools\"]",
        "is_default":"0",
        "requires_auth":"1",
        "sort_order":"100",
        "required_feature":"ai:haiku-4-6",
        "input_cost_per_1m_usd":"1.000000",
        "output_cost_per_1m_usd":"5.000000",
        "cache_creation_cost_per_1m_usd":"1.250000",
        "cache_creation_1h_cost_per_1m_usd":"0.000000",
        "cache_read_cost_per_1m_usd":"0.100000",
        "input_credits_per_1m":"10000",
        "output_credits_per_1m":"50000",
        "cache_creation_credits_per_1m":"12500",
        "cache_creation_1h_credits_per_1m":"0",
        "cache_read_credits_per_1m":"1000",
        "active":"0",
        "notes":null,
        "created_at":"2026-05-18 07:58:43.926",
        "updated_at":"2026-05-18 08:04:58.930"
      }
    ]
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
