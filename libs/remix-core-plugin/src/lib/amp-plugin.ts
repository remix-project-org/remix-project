/* global fetch */
'use strict'
import { Plugin } from '@remixproject/engine'
import { endpointUrls } from '@remix-endpoints-helper'

const profile = {
  name: 'amp',
  methods: ['performAmpQuery', 'fetchManifest', 'listDatasets'],
  events: [],
  version: '0.0.1'
}

export class AmpPlugin extends Plugin {
  constructor() {
    super(profile)
  }

  async performAmpQuery (query: string, baseUrl: string, authToken: string) {
    return await performAmpQuery(
      query,
      baseUrl,
      authToken
    );
  }

  async fetchManifest(datasetName: string, version: string) {
    const url = `https://api.registry.amp.staging.thegraph.com/api/v1/datasets/${datasetName}/versions/${version}/manifest`;
    return await fetch(url);
  }

  async listDatasets () {
    const url = `${endpointUrls.commonCorsProxy}/api/trpc/datasets.list?proxy=https://playground.amp.thegraph.com`;
    return await fetch(url);
  }
}

/**
 * Create an Amp client with the given configuration
 */
async function createAmpClient(baseUrl?: string, authToken?: string) {
  // Dynamic import for ES module packages
  // @ts-ignore - ES module dynamic import
  const { createConnectTransport } = await import("@connectrpc/connect-web");
  // @ts-ignore - ES module dynamic import
  const { createAuthInterceptor, createClient } = await import("@edgeandnode/amp");

  const ampBaseUrl = baseUrl || "/amp";

  const transport = createConnectTransport({
    baseUrl: ampBaseUrl,
    /**
     * If present, adds the auth token to the interceptor path.
     * This adds it to the connect-rpc transport layer and is passed to requests.
     * This is REQUIRED for querying published datasets through the gateway
     */
    interceptors: authToken
      ? [createAuthInterceptor(authToken)]
      : undefined,
  });

  return createClient(transport);
}

/**
 * Performs the given query with the AmpClient instance.
 * Waits for all batches to complete/resolve before returning.
 * @param query the query to run
 * @param baseUrl optional base URL for the Amp server
 * @param authToken optional authentication token
 * @returns an array of the results from all resolved batches
 */
async function performAmpQuery<T = any>(
  query: string,
  baseUrl?: string,
  authToken?: string
): Promise<Array<T>> {
  const ampClient = await createAmpClient(baseUrl, authToken)
  const data: Array<T> = []

  for await (const batch of ampClient.query(query)) {
    data.push(...batch)
  }

  return data
}