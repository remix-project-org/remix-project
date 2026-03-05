import { IMCPTool } from "../types/mcp"
import { SimpleToolSelector } from "./simpleToolSelector"

/**
 * Chat message structure compatible with various LLM providers
 * Supports both simple formats (buildChatPrompt) and complex formats (tool calls)
 */
export interface IChatMessage {
  role: string; // 'user' | 'assistant' | 'system' | 'tool' - flexible to accept any string
  content: string | any; // String content or structured content array
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: {
      name: string;
      arguments: any;
    };
    name?: string; // For direct tool call format
  }>;
  name?: string; // Tool name for tool role messages
}

interface IEnhancedScoredTool {
  tool: IMCPTool;
  score: number;
  matchDetails: {
    // Existing scores from SimpleToolSelector
    nameMatch: number;
    descriptionMatch: number;
    parameterMatch: number;
    categoryMatch: number;
    // New weighted scores
    historyRelevance: number;
    toolUsageFrequency: number;
    temporalRelevance: number;
    conversationContext: number;
  };
}

interface IChatHistoryAnalysis {
  mentionedTools: Map<string, number>; // tool name -> mention count
  usedTools: Map<string, number>; // tool name -> usage count
  recentTopics: string[]; // Recent conversation topics/keywords
  conversationContext: string; // Aggregated context from recent messages
  temporalWeights: Map<string, number>; // tool name -> temporal weight
}

/**
 * Weighted tool selector that considers chat history for improved tool selection.
 *
 * Scoring factors:
 * - Current prompt match (from base selector)
 * - Historical tool mentions and usage
 * - Temporal proximity (recent mentions weighted higher)
 * - Conversation context continuity
 */
export class WeightedToolSelector extends SimpleToolSelector {
  private readonly weights = {
    // Base scores (from SimpleToolSelector)
    nameMatch: 3.0,
    descriptionMatch: 2.0,
    parameterMatch: 1.5,
    categoryMatch: 1.0,
    // History-based scores
    historyRelevance: 2.5, // Tools mentioned in conversation
    toolUsageFrequency: 3.0, // Tools actually used before (high weight)
    temporalRelevance: 1.5, // Recent mentions
    conversationContext: 2.0, // Context continuity
  };

  // Temporal decay parameters
  private readonly temporalDecayFactor = 0.75; // Exponential decay for older messages
  private readonly maxHistoryMessages = 5; // Consider last N messages

  selectToolsWithHistory(
    allTools: IMCPTool[],
    userPrompt: string,
    chatHistory: IChatMessage[] = [],
    maxTools: number = 15
  ): IMCPTool[] {
    console.log('[WeightedToolSelector] Analyzing chat history:', chatHistory.length, 'messages');

    const historyAnalysis = this.analyzeChatHistory(chatHistory, allTools);

    // Log analysis results
    if (historyAnalysis.usedTools.size > 0) {
      console.log('[WeightedToolSelector] Previously used tools:',
        Array.from(historyAnalysis.usedTools.entries())
          .map(([name, count]) => `${name}(${count}x)`)
          .join(', ')
      );
    }

    if (historyAnalysis.mentionedTools.size > 0) {
      console.log('[WeightedToolSelector] Mentioned tools:',
        Array.from(historyAnalysis.mentionedTools.entries())
          .map(([name, count]) => `${name}(${count}x)`)
          .join(', ')
      );
    }

    const promptTokens = this.extractTokens(userPrompt);

    const scoredTools: IEnhancedScoredTool[] = allTools.map(tool => {
      const baseScores = this.scoreTool(tool, promptTokens, userPrompt);
      const historyScores = this.scoreToolWithHistory(tool, historyAnalysis);

      return {
        tool,
        score: 0, // Will be calculated below
        matchDetails: {
          ...baseScores,
          ...historyScores
        }
      };
    });

    scoredTools.forEach(st => {
      st.score =
        st.matchDetails.nameMatch * this.weights.nameMatch +
        st.matchDetails.descriptionMatch * this.weights.descriptionMatch +
        st.matchDetails.parameterMatch * this.weights.parameterMatch +
        st.matchDetails.categoryMatch * this.weights.categoryMatch +
        st.matchDetails.historyRelevance * this.weights.historyRelevance +
        st.matchDetails.toolUsageFrequency * this.weights.toolUsageFrequency +
        st.matchDetails.temporalRelevance * this.weights.temporalRelevance +
        st.matchDetails.conversationContext * this.weights.conversationContext;
    });

    scoredTools.forEach(st => {
      if (this.coreTools.includes(st.tool.name)) {
        st.score += 1.0;
      }
      if (st.tool.name === 'get_skill' || st.tool.name === 'list_skills') {
        st.score += 1.5;
      }
    });

    scoredTools.sort((a, b) => b.score - a.score);

    const topTools = scoredTools.slice(0, maxTools);
    console.log('[WeightedToolSelector] Top weighted matches:');
    topTools.forEach(st => {
      const d = st.matchDetails;
      console.log(
        `  - ${st.tool.name}: ${st.score.toFixed(2)} ` +
        `(name:${d.nameMatch.toFixed(1)} desc:${d.descriptionMatch.toFixed(1)} ` +
        `hist:${d.historyRelevance.toFixed(1)} usage:${d.toolUsageFrequency.toFixed(1)} ` +
        `temporal:${d.temporalRelevance.toFixed(1)} ctx:${d.conversationContext.toFixed(1)})`
      );
    });

    const coreToolResults = scoredTools.filter(st => this.coreTools.includes(st.tool.name));
    const nonCoreResults = scoredTools.filter(st => !this.coreTools.includes(st.tool.name));
    const remainingSlots = maxTools - coreToolResults.length;
    const result = [
      ...coreToolResults.map(st => st.tool),
      ...nonCoreResults.slice(0, Math.max(0, remainingSlots)).map(st => st.tool)
    ];
    console.log(`[WeightedToolSelector] Selected ${result.length} tools (${coreToolResults.length} core + ${result.length - coreToolResults.length} others, max ${maxTools}) with history weighting`);

    return result;
  }

  private analyzeChatHistory(
    chatHistory: IChatMessage[],
    allTools: IMCPTool[]
  ): IChatHistoryAnalysis {
    const mentionedTools = new Map<string, number>();
    const usedTools = new Map<string, number>();
    const temporalWeights = new Map<string, number>();
    const recentTopics: string[] = [];

    const toolNames = new Set(allTools.map(t => t.name));
    const recentMessages = chatHistory.slice(-this.maxHistoryMessages).reverse();
    let conversationContext = '';

    recentMessages.forEach((message, index) => {
      const temporalWeight = Math.pow(this.temporalDecayFactor, index);

      let content = '';
      if (typeof message.content === 'string') {
        content = message.content;
      } else if (Array.isArray(message.content)) {
        content = message.content
          .map(c => (typeof c === 'string' ? c : c.text || ''))
          .join(' ');
      }

      if (index < 3) {
        conversationContext += content + ' ';
        const tokens = this.extractTokens(content);
        tokens.forEach(token => {
          if (token.length > 4 && !recentTopics.includes(token)) {
            recentTopics.push(token);
          }
        });
      }

      toolNames.forEach(toolName => {
        const toolNameLower = toolName.toLowerCase();
        const contentLower = content.toLowerCase();

        if (contentLower.includes(toolNameLower)) {
          mentionedTools.set(toolName, (mentionedTools.get(toolName) || 0) + 1);
          const currentWeight = temporalWeights.get(toolName) || 0;
          temporalWeights.set(toolName, Math.max(currentWeight, temporalWeight));
        }

        const toolParts = toolName.split('_');
        toolParts.forEach(part => {
          if (part.length > 3 && contentLower.includes(part.toLowerCase())) {
            const currentCount = mentionedTools.get(toolName) || 0;
            mentionedTools.set(toolName, currentCount + 0.5); // Partial match bonus
          }
        });
      });

      if (message.tool_calls && message.tool_calls.length > 0) {
        message.tool_calls.forEach(toolCall => {
          let toolName: string | undefined;

          // Handle different tool call formats
          if (toolCall.function?.name) {
            toolName = toolCall.function.name;
          } else if (toolCall.name) {
            toolName = toolCall.name;
          }

          if (toolName && toolNames.has(toolName)) {
            usedTools.set(toolName, (usedTools.get(toolName) || 0) + 1);

            const currentWeight = temporalWeights.get(toolName) || 0;
            temporalWeights.set(toolName, Math.max(currentWeight, temporalWeight * 1.2));
          }
        });
      }

      if (message.role === 'tool' && message.name && toolNames.has(message.name)) {
        usedTools.set(message.name, (usedTools.get(message.name) || 0) + 1);
      }
    });

    return {
      mentionedTools,
      usedTools,
      recentTopics: recentTopics.slice(0, 10), // Keep top 10 topics
      conversationContext: conversationContext.trim(),
      temporalWeights
    };
  }

  private scoreToolWithHistory(
    tool: IMCPTool,
    analysis: IChatHistoryAnalysis
  ): {
    historyRelevance: number;
    toolUsageFrequency: number;
    temporalRelevance: number;
    conversationContext: number;
  } {
    const toolName = tool.name;

    const mentionCount = analysis.mentionedTools.get(toolName) || 0;
    const historyRelevance = Math.min(mentionCount / 3, 1.0); // Normalize to 0-1

    const usageCount = analysis.usedTools.get(toolName) || 0;
    const toolUsageFrequency = Math.min(usageCount / 2, 1.0); // Normalize to 0-1, higher weight

    const temporalWeight = analysis.temporalWeights.get(toolName) || 0;
    const temporalRelevance = temporalWeight; // Already 0-1 from decay function

    let conversationContext = 0;
    if (analysis.conversationContext) {
      const contextTokens = this.extractTokens(analysis.conversationContext);
      const toolTokens = this.extractTokens(
        tool.name + ' ' + (tool.description || '')
      );

      conversationContext = this.calculateTokenOverlap(contextTokens, toolTokens);
      if (analysis.recentTopics.some(topic =>
        toolName.toLowerCase().includes(topic) ||
        topic.includes(toolName.toLowerCase())
      )) {
        conversationContext += 0.3;
      }
    }

    return {
      historyRelevance: Math.min(historyRelevance, 1.0),
      toolUsageFrequency: Math.min(toolUsageFrequency, 1.0),
      temporalRelevance: Math.min(temporalRelevance, 1.0),
      conversationContext: Math.min(conversationContext, 1.0)
    };
  }

  override selectTools(
    allTools: IMCPTool[],
    userPrompt: string,
    maxTools: number = 15,
    chatHistory?: IChatMessage[]
  ): IMCPTool[] {
    if (chatHistory && chatHistory.length > 0) {
      return this.selectToolsWithHistory(allTools, userPrompt, chatHistory, maxTools);
    }

    console.log('[WeightedToolSelector] No chat history, using keyword-based selection', chatHistory);
    return super.selectTools(allTools, userPrompt, maxTools);
  }

  override extractTokens(text: string): string[] {
    const tokens = text.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 2);

    const stopWords = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'what', 'how', 'can', 'could', 'would', 'should']);
    return tokens.filter(token => !stopWords.has(token));
  }

}
