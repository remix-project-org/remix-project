import { ChatEntry } from "../types/types"

export abstract class ChatHistory{

  private static chatEntries:ChatEntry[] = []
  static queueSize:number = 7 // change the queue size wrt the GPU size

  public static pushHistory(prompt, result){
    if (result === "" || !result) return // do not allow empty assistant message due to nested stream handles on toolcalls

    // Check if an entry with the same prompt already exists
    const existingEntryIndex = this.chatEntries.findIndex(entry => entry[0] === prompt)

    if (existingEntryIndex !== -1) {
      this.chatEntries[existingEntryIndex][1] = result
    } else {
      const chat:ChatEntry = [prompt, result]
      this.chatEntries.push(chat)
      if (this.chatEntries.length > this.queueSize){this.chatEntries.shift()}
    }
  }

  public static getHistory(){
    return this.chatEntries
  }

  public static clearHistory(){
    this.chatEntries = []
  }
}
