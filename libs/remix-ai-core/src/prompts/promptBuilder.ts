import { ChatHistory } from "./chat"

export const buildChatPrompt = (maxPairs?: number) => {
  const entries = ChatHistory.getHistory()
  const scopedEntries = typeof maxPairs === 'number' ? entries.slice(-maxPairs) : entries
  const history = []
  for (const [question, answer] of scopedEntries) {
    history.push({ role:'user', content: question })
    history.push({ role:'assistant' , content: answer })
  }
  return history
}
