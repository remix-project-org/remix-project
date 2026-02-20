
// see https://huggingface.co/spaces/enzostvs/deepsite
export const SEARCH_START = "<<<<<<< SEARCH";
export const DIVIDER = "=======";
export const REPLACE_END = ">>>>>>> REPLACE";
export const MAX_REQUESTS_PER_IP = 2;
export const TITLE_PAGE_START = "<<<<<<< START_TITLE ";
export const TITLE_PAGE_END = " >>>>>>> END_TITLE";
export const NEW_PAGE_START = "<<<<<<< NEW_PAGE_START ";
export const NEW_PAGE_END = " >>>>>>> NEW_PAGE_END";
export const UPDATE_PAGE_START = "<<<<<<< UPDATE_PAGE_START ";
export const UPDATE_PAGE_END = " >>>>>>> UPDATE_PAGE_END";

export {
  buildSystemPrompt,
  buildUserMessage,
  invariants,
  blockchain,
  platform,
  visualSource,
  userIntent,
  updateRules,
} from './prompt-blocks'
export type { PromptContext, BuildUserMessageOptions } from './prompt-blocks'

import { buildSystemPrompt as _build } from './prompt-blocks'

export const INITIAL_SYSTEM_PROMPT = _build({
  contract: { address: '{{ADDRESS}}', abi: [], chainId: 1 },
  isUpdate: false,
})

export const FOLLOW_UP_SYSTEM_PROMPT = _build({
  contract: { address: '{{ADDRESS}}', abi: [], chainId: 1 },
  isUpdate: true,
})

export const BASE_MINI_APP_SYSTEM_PROMPT = _build({
  contract: { address: '{{ADDRESS}}', abi: [], chainId: 8453 },
  isBaseMiniApp: true,
})