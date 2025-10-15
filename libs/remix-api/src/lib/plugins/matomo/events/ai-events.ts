/**
 * AI Events - AI and Copilot related tracking events
 * 
 * This file contains all AI-related Matomo events including RemixAI interactions,
 * Ollama local AI, and code completion features.
 */

import { MatomoEventBase } from '../core/base-types';

export interface AIEvent extends MatomoEventBase {
  category: 'ai';
  action: 
    | 'remixAI'
    | 'error_explaining_SolidityError'
    | 'vulnerability_check_pasted_code'
    | 'generateDocumentation'
    | 'explainFunction'
    | 'Copilot_Completion_Accepted'
    | 'code_generation'
    | 'code_insertion'
    | 'code_completion'
    | 'AddingAIContext'
    | 'ollama_host_cache_hit'
    | 'ollama_port_check'
    | 'ollama_host_discovered_success'
    | 'ollama_port_connection_failed'
    | 'ollama_host_discovery_failed'
    | 'ollama_availability_check'
    | 'ollama_availability_result'
    | 'ollama_list_models_start'
    | 'ollama_list_models_failed'
    | 'ollama_reset_host'
    | 'ollama_pull_model_start'
    | 'ollama_pull_model_failed'
    | 'ollama_pull_model_success'
    | 'ollama_pull_model_error'
    | 'ollama_get_best'
    | 'ollama_get_best_model_error'
    | 'ollama_initialize_failed'
    | 'ollama_host_discovered'
    | 'ollama_models_found'
    | 'ollama_model_auto_selected'
    | 'ollama_initialize_success'
    | 'ollama_model_selection_error'
    | 'ollama_fim_native'
    | 'ollama_fim_token_based'
    | 'ollama_completion_no_fim'
    | 'ollama_suffix_overlap_removed'
    | 'ollama_code_completion_complete'
    | 'ollama_code_insertion'
    | 'ollama_generate_contract'
    | 'ollama_generate_workspace'
    | 'ollama_chat_answer'
    | 'ollama_code_explaining'
    | 'ollama_error_explaining'
    | 'ollama_vulnerability_check'
    | 'ollama_provider_selected'
    | 'ollama_fallback_to_provider'
    | 'ollama_default_model_selected'
    | 'ollama_unavailable'
    | 'ollama_connection_error'
    | 'ollama_model_selected'
    | 'ollama_model_set_backend_success'
    | 'ollama_model_set_backend_failed';
}



/**
 * RemixAI Events - Specific to RemixAI interactions
 */
export interface RemixAIEvent extends MatomoEventBase {
  category: 'remixAI';
  action:
    | 'ModeSwitch'
    | 'GenerateNewAIWorkspaceFromEditMode'
    | 'SetAIProvider'
    | 'SetOllamaModel'
    | 'GenerateNewAIWorkspaceFromModal';
}



/**
 * RemixAI Assistant Events - Specific to assistant interactions
 */
export interface RemixAIAssistantEvent extends MatomoEventBase {
  category: 'remixAIAssistant';
  action:
    | 'likeResponse'
    | 'dislikeResponse';
}

