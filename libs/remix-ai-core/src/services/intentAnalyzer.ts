import { IUserIntent } from '../types/mcp';

/**
 * Service for analyzing user queries to extract intent and context
 */
export class IntentAnalyzer {
  private readonly intentPatterns = {
    coding: [
      /write|create|build|implement|develop|code|program/i,
      /function|class|method|variable|array|object/i,
      /how to (write|create|build|implement)/i
    ],
    documentation: [
      /what is|explain|describe|tell me about|documentation|docs/i,
      /how does .* work|understand|learn about/i,
      /definition|meaning|purpose/i
    ],
    debugging: [
      /error|bug|fix|debug|troubleshoot|problem|issue/i,
      /not working|fails|broken|wrong/i,
      /why (doesn't|does not|won't|will not)/i
    ],
    explanation: [
      /explain|describe|understand|clarify|elaborate/i,
      /why|how|what does.*do|what happens when/i,
      /break down|walk through/i
    ],
    generation: [
      /generate|create|make|build|write/i,
      /new.*project|scaffold|template|boilerplate/i,
      /from scratch|start.*project/i
    ],
    completion: [
      /complete|finish|fill|auto.*complete/i,
      /suggest|recommend|what should/i,
      /continue|next step/i
    ]
  };

  private readonly domainKeywords = {
    solidity: ['solidity', 'smart contract', 'ethereum', 'blockchain', 'web3', 'dapp', 'evm'],
    javascript: ['javascript', 'js', 'node', 'npm', 'typescript', 'ts'],
    react: ['react', 'jsx', 'tsx', 'component', 'hook', 'state'],
    web3: ['web3', 'ethers', 'metamask', 'wallet', 'transaction', 'gas'],
    testing: ['test', 'testing', 'unit test', 'integration test', 'mocha', 'chai', 'jest'],
    deployment: ['deploy', 'deployment', 'production', 'build', 'compile'],
    security: ['security', 'vulnerability', 'audit', 'safe', 'reentrancy', 'overflow'],
    defi: ['defi', 'uniswap', 'compound', 'aave', 'lending', 'liquidity', 'amm'],
    nft: ['nft', 'erc721', 'erc1155', 'token', 'opensea', 'metadata']
  };

  private readonly complexityIndicators = {
    low: [
      /simple|basic|easy|quick|small/i,
      /how to.*\w{1,20}$/i, // Simple "how to" questions
      /what is.*\w{1,30}$/i // Simple "what is" questions
    ],
    medium: [
      /implement|integrate|setup|configure/i,
      /best practice|pattern|approach/i,
      /multiple.*step|several.*part/i
    ],
    high: [
      /optimize|performance|scalable|architecture/i,
      /complex|advanced|sophisticated/i,
      /multiple.*system|integration.*with/i,
      /production.*ready|enterprise/i
    ]
  };

  private readonly synonyms: Record<string, string[]> = {
    'smart contract': ['contract', 'dapp', 'blockchain app'],
    'function': ['method', 'procedure', 'routine'],
    'variable': ['var', 'property', 'field'],
    'error': ['bug', 'issue', 'problem', 'exception'],
    'create': ['make', 'build', 'generate', 'develop'],
    'explain': ['describe', 'clarify', 'elaborate', 'detail']
  };

  /**
   * Analyze user query to extract intent and context
   */
  async analyzeIntent(query: string): Promise<IUserIntent> {
    const normalizedQuery = query.toLowerCase().trim();

    // Extract intent type
    const intentType = this.extractIntentType(normalizedQuery);
    const confidence = this.calculateConfidence(normalizedQuery, intentType);

    // Extract keywords
    const keywords = this.extractKeywords(normalizedQuery);

    // Detect domains
    const domains = this.detectDomains(normalizedQuery);

    // Determine complexity
    const complexity = this.determineComplexity(normalizedQuery);

    return {
      type: intentType,
      confidence,
      keywords,
      domains,
      complexity,
      originalQuery: query
    };
  }

  /**
   * Expand query with synonyms and related terms
   */
  expandQuery(query: string, maxExpansionTerms: number = 10): string[] {
    const words = query.toLowerCase().split(/\s+/);
    const expandedTerms = new Set([query]);

    for (const word of words) {
      for (const [key, synonymList] of Object.entries(this.synonyms)) {
        if (key.includes(word) || word.includes(key)) {
          synonymList.forEach(synonym => {
            if (expandedTerms.size < maxExpansionTerms) {
              expandedTerms.add(query.replace(new RegExp(word, 'gi'), synonym));
            }
          });
        }
      }
    }

    return Array.from(expandedTerms);
  }

  private extractIntentType(query: string): IUserIntent['type'] {
    const scores = Object.entries(this.intentPatterns).map(([type, patterns]) => {
      const score = patterns.reduce((acc, pattern) => {
        return acc + (pattern.test(query) ? 1 : 0);
      }, 0);
      return { type: type as IUserIntent['type'], score };
    });

    // Sort by score and return highest
    scores.sort((a, b) => b.score - a.score);
    return scores[0].score > 0 ? scores[0].type : 'explanation';
  }

  private calculateConfidence(query: string, intentType: IUserIntent['type']): number {
    const patterns = this.intentPatterns[intentType];
    const matchCount = patterns.filter(pattern => pattern.test(query)).length;
    const totalPatterns = patterns.length;

    let confidence = matchCount / totalPatterns;

    // Boost confidence for clear indicators
    if (query.includes('?')) confidence += 0.1;
    if (query.length > 10) confidence += 0.1;
    if (query.length > 50) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private extractKeywords(query: string): string[] {
    // Remove common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'cannot',
      'how', 'what', 'when', 'where', 'why', 'who', 'which'
    ]);

    const words = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Extract technical terms and multi-word phrases
    const keywords = new Set(words);

    // Add domain-specific multi-word phrases
    for (const [domain, domainWords] of Object.entries(this.domainKeywords)) {
      for (const phrase of domainWords) {
        if (query.toLowerCase().includes(phrase)) {
          keywords.add(phrase);
        }
      }
    }

    return Array.from(keywords);
  }

  private detectDomains(query: string): string[] {
    const detectedDomains = [];

    for (const [domain, keywords] of Object.entries(this.domainKeywords)) {
      const matchCount = keywords.filter(keyword =>
        query.toLowerCase().includes(keyword.toLowerCase())
      ).length;

      if (matchCount > 0) {
        detectedDomains.push(domain);
      }
    }

    return detectedDomains;
  }

  private determineComplexity(query: string): IUserIntent['complexity'] {
    for (const [complexity, patterns] of Object.entries(this.complexityIndicators)) {
      const hasMatch = patterns.some(pattern => pattern.test(query));
      if (hasMatch) {
        return complexity as IUserIntent['complexity'];
      }
    }

    // Fallback based on query length and structure
    if (query.length < 20) return 'low';
    if (query.length < 100) return 'medium';
    return 'high';
  }
}