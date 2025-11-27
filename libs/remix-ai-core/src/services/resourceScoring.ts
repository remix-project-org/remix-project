import { IMCPResource, IUserIntent, IResourceScore, IEnhancedMCPProviderParams } from '../types/mcp';

/**
 * Service for scoring and ranking MCP resources based on user intent
 */
export class ResourceScoring {
  private readonly defaultDomainWeights: Record<string, number> = {
    solidity: 1.0,
    javascript: 0.8,
    react: 0.7,
    web3: 0.9,
    testing: 0.6,
    deployment: 0.7,
    security: 1.0,
    defi: 0.8,
    nft: 0.7
  };

  private readonly intentTypeWeights: Record<IUserIntent['type'], Record<string, number>> = {
    coding: {
      code: 1.0,
      example: 0.9,
      template: 0.8,
      documentation: 0.6,
      tutorial: 0.7
    },
    documentation: {
      documentation: 1.0,
      readme: 0.9,
      guide: 0.8,
      reference: 0.9,
      api: 0.7
    },
    debugging: {
      troubleshooting: 1.0,
      error: 0.9,
      debug: 0.9,
      issue: 0.8,
      solution: 0.8
    },
    explanation: {
      documentation: 1.0,
      tutorial: 0.9,
      guide: 0.8,
      concept: 0.9,
      theory: 0.7
    },
    generation: {
      template: 1.0,
      boilerplate: 0.9,
      scaffold: 0.8,
      example: 0.8,
      starter: 0.7
    },
    completion: {
      reference: 1.0,
      api: 0.9,
      documentation: 0.8,
      example: 0.7,
      snippet: 0.8
    }
  };

  /**
   * Score a collection of resources against user intent
   */
  async scoreResources(
    resources: Array<{ resource: IMCPResource; serverName: string }>,
    intent: IUserIntent,
    params: IEnhancedMCPProviderParams = {}
  ): Promise<IResourceScore[]> {
    const domainWeights = { ...this.defaultDomainWeights, ...(params.domainWeights || {}) };
    const relevanceThreshold = params.relevanceThreshold || 0.35;

    const scoredResources: IResourceScore[] = [];

    for (const { resource, serverName } of resources) {
      const score = this.calculateResourceScore(resource, intent, domainWeights);

      if (score.score >= relevanceThreshold) {
        scoredResources.push({
          resource,
          serverName,
          score: score.score,
          components: score.components,
          reasoning: score.reasoning
        });
      }
    }

    // Sort by score descending
    return scoredResources.sort((a, b) => b.score - a.score);
  }

  /**
   * Select best resources based on strategy and constraints
   */
  selectResources(
    scoredResources: IResourceScore[],
    maxResources: number = 10,
    strategy: 'priority' | 'semantic' | 'hybrid' = 'hybrid'
  ): IResourceScore[] {
    switch (strategy) {
    case 'priority':
      return this.selectByPriority(scoredResources, maxResources);
    case 'semantic':
      return this.selectBySemantic(scoredResources, maxResources);
    case 'hybrid':
      return this.selectByHybrid(scoredResources, maxResources);
    default:
      return scoredResources.slice(0, maxResources);
    }
  }

  private calculateResourceScore(
    resource: IMCPResource,
    intent: IUserIntent,
    domainWeights: Record<string, number>
  ): { score: number; components: IResourceScore['components']; reasoning: string } {
    const components = {
      keywordMatch: this.calculateKeywordMatch(resource, intent.keywords),
      domainRelevance: this.calculateDomainRelevance(resource, intent.domains, domainWeights),
      typeRelevance: this.calculateTypeRelevance(resource, intent.type),
      priority: this.calculatePriorityScore(resource),
      freshness: this.calculateFreshnessScore(resource)
    };

    // Weighted combination of components
    const weights = {
      keywordMatch: 0.3,
      domainRelevance: 0.25,
      typeRelevance: 0.25,
      priority: 0.15,
      freshness: 0.05
    };

    const score = Object.entries(components).reduce((acc, [component, value]) => {
      return acc + (weights[component as keyof typeof weights] * value);
    }, 0);

    const reasoning = this.generateReasoningExplanation(components, resource, intent);

    return { score, components, reasoning };
  }

  private calculateKeywordMatch(resource: IMCPResource, keywords: string[]): number {
    if (keywords.length === 0) return 0;

    const resourceText = [
      resource.name,
      resource.description || '',
      resource.uri
    ].join(' ').toLowerCase();

    const matches = keywords.filter(keyword =>
      resourceText.includes(keyword.toLowerCase())
    );

    return matches.length / keywords.length;
  }

  private calculateDomainRelevance(
    resource: IMCPResource,
    domains: string[],
    domainWeights: Record<string, number>
  ): number {
    if (domains.length === 0) return 0.5; // Neutral if no domains detected

    const resourceText = [
      resource.name,
      resource.description || '',
      resource.uri
    ].join(' ').toLowerCase();

    let totalRelevance = 0;
    let matchCount = 0;

    for (const domain of domains) {
      const weight = domainWeights[domain] || 0.5;
      if (resourceText.includes(domain.toLowerCase())) {
        totalRelevance += weight;
        matchCount++;
      }
    }

    return matchCount > 0 ? totalRelevance / matchCount : 0;
  }

  private calculateTypeRelevance(resource: IMCPResource, intentType: IUserIntent['type']): number {
    const typeWeights = this.intentTypeWeights[intentType];
    if (!typeWeights) return 0.5;

    const resourceText = [
      resource.name,
      resource.description || '',
      resource.uri
    ].join(' ').toLowerCase();

    let maxRelevance = 0;
    for (const [type, weight] of Object.entries(typeWeights)) {
      if (resourceText.includes(type.toLowerCase())) {
        maxRelevance = Math.max(maxRelevance, weight);
      }
    }

    return maxRelevance;
  }

  private calculatePriorityScore(resource: IMCPResource): number {
    const priority = resource.annotations?.priority;
    if (typeof priority === 'number') {
      // Normalize priority (assuming 1-10 scale)
      return Math.min(priority / 10, 1.0);
    }
    return 0.5; // Default if no priority specified
  }

  private calculateFreshnessScore(resource: IMCPResource): number {
    // This could be enhanced with actual last-modified dates
    // For now, return a neutral score
    return 0.5;
  }

  private selectByPriority(resources: IResourceScore[], maxResources: number): IResourceScore[] {
    return [...resources]
      .sort((a, b) => b.components.priority - a.components.priority)
      .slice(0, maxResources);
  }

  private selectBySemantic(resources: IResourceScore[], maxResources: number): IResourceScore[] {
    const semanticScore = (r: IResourceScore) =>
      (r.components.keywordMatch + r.components.domainRelevance + r.components.typeRelevance) / 3;

    return [...resources]
      .sort((a, b) => semanticScore(b) - semanticScore(a))
      .slice(0, maxResources);
  }

  private selectByHybrid(resources: IResourceScore[], maxResources: number): IResourceScore[] {
    // Ensure diversity by selecting from different servers and types
    const selected: IResourceScore[] = [];
    const serverCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();

    for (const resource of resources) {
      if (selected.length >= maxResources) break;

      const serverCount = serverCounts.get(resource.serverName) || 0;
      const resourceType = this.inferResourceType(resource.resource);
      const typeCount = typeCounts.get(resourceType) || 0;

      // Prefer diversity but still consider score
      const diversityPenalty = Math.min(serverCount * 0.1, 0.3) + Math.min(typeCount * 0.1, 0.3);
      const adjustedScore = resource.score * (1 - diversityPenalty);

      if (adjustedScore > 0.1) { // Minimum threshold
        selected.push(resource);
        serverCounts.set(resource.serverName, serverCount + 1);
        typeCounts.set(resourceType, typeCount + 1);
      }
    }

    return selected;
  }

  private inferResourceType(resource: IMCPResource): string {
    const name = resource.name.toLowerCase();
    const uri = resource.uri.toLowerCase();

    if (name.includes('readme') || uri.includes('readme')) return 'readme';
    if (name.includes('example') || uri.includes('example')) return 'example';
    if (name.includes('template') || uri.includes('template')) return 'template';
    if (name.includes('api') || uri.includes('api')) return 'api';
    if (name.includes('guide') || uri.includes('guide')) return 'guide';
    if (resource.mimeType?.includes('code') || uri.includes('.sol') || uri.includes('.js')) return 'code';

    return 'documentation';
  }

  private generateReasoningExplanation(
    components: IResourceScore['components'],
    resource: IMCPResource,
    intent: IUserIntent
  ): string {
    const reasons = [];

    if (components.keywordMatch > 0.7) {
      reasons.push(`Strong keyword match (${Math.round(components.keywordMatch * 100)}%)`);
    }

    if (components.domainRelevance > 0.7) {
      reasons.push(`Highly relevant to ${intent.domains.join(', ')} domains`);
    }

    if (components.typeRelevance > 0.7) {
      reasons.push(`Well-suited for ${intent.type} tasks`);
    }

    if (components.priority > 0.7) {
      reasons.push('High priority resource');
    }

    if (reasons.length === 0) {
      reasons.push('General relevance match');
    }

    return reasons.join('; ');
  }
}