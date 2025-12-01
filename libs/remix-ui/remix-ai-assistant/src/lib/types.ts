export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sentiment?: 'none' | 'like' | 'dislike'
  isExecutingTools?: boolean
}

export const assistantAvatar = 'assets/img/remixai-logoDefault.webp'//'assets/img/aiLogo.svg'

export type ActivityType =
  | 'typing'
  | 'button'
  | 'promptSend'
  | 'streamStart'
  | 'streamEnd'