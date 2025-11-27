/* eslint-disable no-case-declarations */
/**
 * Remix Resource Provider Registry Implementation
 */

import { Plugin } from '@remixproject/engine';
import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import {
  ResourceProviderRegistry,
  RemixResourceProvider,
  ResourceQuery,
  ResourceSearchResult,
  ResourceUpdateEvent,
  ResourceCategory
} from '../types/mcpResources';

export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint';
}

const replacer = (key: string, value: any) => {
  if (isBigInt(value)) return value.toString(); // Convert BigInt to string
  if (typeof value === 'function') return undefined; // Remove functions
  if (value instanceof Error) {
    return value.message;
  }
  return value;
}

/**
 * Registry for managing Remix MCP resource providers
 */
export class RemixResourceProviderRegistry implements ResourceProviderRegistry {
  private providers: Map<string, RemixResourceProvider> = new Map();
  private subscribers: Set<(event: ResourceUpdateEvent) => void> = new Set();
  private resourceCache: Map<string, { resources: IMCPResource[]; timestamp: Date }> = new Map();
  private cacheTimeout: number = 30000; // 30 seconds
  private plugin

  constructor(props){
    this.plugin = props
  }
  /**
   * Register a resource provider
   */
  register(provider: RemixResourceProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`Resource provider '${provider.name}' is already registered`);
    }

    this.providers.set(provider.name, provider);
    this.notifySubscribers({
      type: 'created',
      resource: {
        uri: `provider://${provider.name}`,
        name: provider.name,
        description: provider.description,
        mimeType: 'application/json'
      },
      timestamp: new Date(),
      provider: provider.name
    });
  }

  /**
   * Unregister a resource provider
   */
  unregister(name: string): void {
    const provider = this.providers.get(name);
    if (provider) {
      this.providers.delete(name);
      this.resourceCache.delete(name);

      this.notifySubscribers({
        type: 'deleted',
        resource: {
          uri: `provider://${name}`,
          name: name,
          description: provider.description,
          mimeType: 'application/json'
        },
        timestamp: new Date(),
        provider: name
      });
    }
  }

  /**
   * Get a specific resource provider
   */
  get(name: string): RemixResourceProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * List all resource providers
   */
  list(): RemixResourceProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get resources from all providers
   */
  async getResources(query?: ResourceQuery): Promise<ResourceSearchResult> {
    const allResources: IMCPResource[] = [];

    // Collect resources from all providers
    for (const [name, provider] of this.providers) {
      try {
        let resources: IMCPResource[];

        // Check cache first
        const cached = this.resourceCache.get(name);
        if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTimeout) {
          resources = cached.resources;
        } else {
          resources = await provider.getResources(this.plugin);
          this.resourceCache.set(name, { resources, timestamp: new Date() });
        }

        allResources.push(...resources);
      } catch (error) {
        console.warn(`Failed to get resources from provider ${name}:`, error);
      }
    }

    // Apply query filters if provided
    let filteredResources = allResources;
    if (query) {
      filteredResources = this.applyQuery(allResources, query);
    }

    // Apply pagination
    const offset = query?.offset || 0;
    const limit = query?.limit || 50;
    const paginatedResources = filteredResources.slice(offset, offset + limit);

    return {
      resources: paginatedResources,
      total: filteredResources.length,
      hasMore: filteredResources.length > offset + limit,
      query: query || {}
    };
  }

  /**
   * Get specific resource content
   */
  async getResourceContent(uri: string): Promise<IMCPResourceContent> {

    // Find provider that can handle this URI
    for (const provider of this.providers.values()) {
      if (provider.canHandle(uri)) {
        try {
          return await provider.getResourceContent(uri, this.plugin);
        } catch (error) {
          console.warn(`Provider ${provider.name} failed to get resource ${uri}:`, error);
        }
      }
    }

    throw new Error(`No provider found for resource: ${uri}`);
  }

  /**
   * Subscribe to resource update events
   */
  subscribe(callback: (event: ResourceUpdateEvent) => void): void {
    this.subscribers.add(callback);
  }

  /**
   * Unsubscribe from resource update events
   */
  unsubscribe(callback: (event: ResourceUpdateEvent) => void): void {
    this.subscribers.delete(callback);
  }

  /**
   * Clear resource cache
   */
  clearCache(): void {
    this.resourceCache.clear();
  }

  /**
   * Refresh resources from all providers
   */
  async refreshResources(): Promise<void> {
    this.resourceCache.clear();

    for (const [name, provider] of this.providers) {
      try {
        const resources = await provider.getResources(this.plugin);
        this.resourceCache.set(name, { resources, timestamp: new Date() });
      } catch (error) {
        console.warn(`Failed to refresh resources from provider ${name}:`, error);
      }
    }
  }

  /**
   * Get provider statistics
   */
  async getProviderStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};

    for (const [name, provider] of this.providers) {
      try {
        const resources = await provider.getResources(this.plugin);
        stats[name] = {
          resourceCount: resources.length,
          lastUpdate: this.resourceCache.get(name)?.timestamp || null,
          metadata: provider.getMetadata?.() || null
        };
      } catch (error) {
        stats[name] = {
          resourceCount: 0,
          error: error.message,
          lastUpdate: null
        };
      }
    }

    return stats;
  }

  /**
   * Search resources across all providers
   */
  async searchResources(searchTerm: string, category?: ResourceCategory): Promise<IMCPResource[]> {
    const searchResult = await this.getResources({
      keywords: [searchTerm],
      category,
      limit: 100
    });

    return searchResult.resources.filter(resource => {
      const searchFields = [
        resource.name,
        resource.description || '',
        resource.uri
      ].join(' ').toLowerCase();

      return searchFields.includes(searchTerm.toLowerCase());
    });
  }

  /**
   * Get resources by category
   */
  async getResourcesByCategory(category: ResourceCategory): Promise<IMCPResource[]> {
    const searchResult = await this.getResources({ category, limit: 1000 });
    return searchResult.resources;
  }

  /**
   * Apply query filters to resources
   */
  private applyQuery(resources: IMCPResource[], query: ResourceQuery): IMCPResource[] {
    let filtered = resources;

    // Filter by category
    if (query.category) {
      filtered = filtered.filter(resource =>
        (resource as any).metadata?.category === query.category
      );
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      filtered = filtered.filter(resource =>
        query.tags!.some(tag =>
          (resource as any).metadata?.tags?.includes(tag) ||
          resource.name.toLowerCase().includes(tag.toLowerCase()) ||
          resource.description?.toLowerCase().includes(tag.toLowerCase())
        )
      );
    }

    // Filter by keywords
    if (query.keywords && query.keywords.length > 0) {
      filtered = filtered.filter(resource => {
        const searchText = [
          resource.name,
          resource.description || '',
          resource.uri,
          ...(resource.annotations?.audience || [])
        ].join(' ').toLowerCase();

        return query.keywords!.some(keyword =>
          searchText.includes(keyword.toLowerCase())
        );
      });
    }

    // Filter by date range
    if (query.dateRange) {
      filtered = filtered.filter(resource => {
        const lastModified = (resource as any).metadata?.lastModified;
        if (!lastModified) return false;

        const date = new Date(lastModified);
        return date >= query.dateRange!.from && date <= query.dateRange!.to;
      });
    }

    // Filter by size
    if (query.size) {
      filtered = filtered.filter(resource => {
        const size = (resource as any).metadata?.size;
        if (size === undefined) return true;

        const withinMin = !query.size!.min || size >= query.size!.min;
        const withinMax = !query.size!.max || size <= query.size!.max;
        return withinMin && withinMax;
      });
    }

    // Filter by language
    if (query.language) {
      filtered = filtered.filter(resource =>
        (resource as any).metadata?.language === query.language
      );
    }

    // Sort results
    if (query.sortBy) {
      filtered = this.sortResources(filtered, query.sortBy, query.sortOrder || 'asc');
    }

    return filtered;
  }

  /**
   * Sort resources by specified criteria
   */
  private sortResources(
    resources: IMCPResource[],
    sortBy: 'name' | 'date' | 'size' | 'relevance',
    order: 'asc' | 'desc'
  ): IMCPResource[] {
    const multiplier = order === 'desc' ? -1 : 1;

    return resources.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'date':
        const dateA = (a as any).metadata?.lastModified || new Date(0);
        const dateB = (b as any).metadata?.lastModified || new Date(0);
        comparison = new Date(dateA).getTime() - new Date(dateB).getTime();
        break;
      case 'size':
        const sizeA = (a as any).metadata?.size || 0;
        const sizeB = (b as any).metadata?.size || 0;
        comparison = sizeA - sizeB;
        break;
      case 'relevance':
        // TODO: Implement relevance scoring
        comparison = 0;
        break;
      }

      return comparison * multiplier;
    });
  }

  /**
   * Notify all subscribers of resource events
   */
  private notifySubscribers(event: ResourceUpdateEvent): void {
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (error) {
        console.warn('Resource event subscriber error:', error);
      }
    }
  }
}

/**
 * Base class for implementing resource providers
 */
export abstract class BaseResourceProvider implements RemixResourceProvider {
  abstract name: string;
  abstract description: string;

  abstract getResources(plugin: Plugin): Promise<IMCPResource[]>;
  abstract getResourceContent(uri: string, plugin: Plugin): Promise<IMCPResourceContent>;
  abstract canHandle(uri: string): boolean;

  getMetadata(): any {
    return {
      name: this.name,
      description: this.description,
      version: '1.0.0',
      lastRefresh: new Date()
    };
  }

  /**
   * Helper method to create basic resource
   */
  protected createResource(
    uri: string,
    name: string,
    description?: string,
    mimeType?: string,
    metadata?: any
  ): IMCPResource {
    return {
      uri,
      name,
      description,
      mimeType,
      annotations: {
        priority: metadata?.priority || 5,
        audience: metadata?.audience || []
      }
    };
  }

  /**
   * Helper method to create text content
   */
  protected createTextContent(uri: string, text: string, mimeType = 'text/plain'): IMCPResourceContent {
    return {
      uri,
      mimeType,
      text
    };
  }

  /**
   * Helper method to create JSON content
   */
  protected createJsonContent(uri: string, data: any): IMCPResourceContent {
    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, replacer, 2)
    };
  }

}