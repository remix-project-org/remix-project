import { endpointUrls } from '@remix-endpoints-helper';

const safeScriptJson = (value: any): string => JSON.stringify(value).replace(/<\//g, '<\\/');

const uint8ToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000; // avoid call stack limits from String.fromCharCode.apply on large arrays
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
  }
  return btoa(binary);
};

/**
 * Read a file from the Remix filesystem and return it as a `data:` URL.
 * Preview runs the built DApp in an iframe populated via doc.write() with no real
 * origin backing it, so relative fetch() paths (e.g. 'zk/circuit.wasm') can't resolve
 * to the Remix filesystem. Embedding the content as a data URL sidesteps that.
 */
const readFileAsDataUrl = async (plugin: any, path: string, mimeType: string): Promise<string | null> => {
  try {
    const data = await plugin.call('fileManager', 'readFile', path, { encoding: null });
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
    return `data:${mimeType};base64,${uint8ToBase64(bytes)}`;
  } catch (e) {
    return null;
  }
};

export const getZkCircuitConfig = (activeDapp: any): any | null => {
  return activeDapp?.zkCircuit || null;
};

export const hasZkCircuit = (activeDapp: any): boolean => {
  const zkCircuit = getZkCircuitConfig(activeDapp);
  return !!zkCircuit && zkCircuit.provingScheme === 'groth16';
};

const getZkVerifyEndpoint = (): string => {
  return endpointUrls.zkverify;
};

const getRemixAccessToken = (): string => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('remix_access_token') || '' : '';
  } catch {
    return '';
  }
};

const getZkVerifyApiKey = async (plugin: any): Promise<string> => {
  try {
    return await plugin.call('config', 'getAppParameter', 'settings/zkverify-api-key') || '';
  } catch {
    return '';
  }
};

const getZkVerifyNetwork = async (plugin: any): Promise<'testnet' | 'mainnet'> => {
  try {
    const network = await plugin.call('config', 'getAppParameter', 'settings/zkverify-network');
    return network === 'mainnet' ? 'mainnet' : 'testnet';
  } catch {
    return 'testnet';
  }
};

/**
 * Create a sealed proxy token for zkVerify verification.
 * This allows deployed DApps to verify proofs without exposing API keys.
 */
const createZkVerifyProxyToken = async (
  apiKey: string,
  network: 'testnet' | 'mainnet'
): Promise<string> => {
  if (!apiKey) throw new Error('zkVerify API key is required to deploy this ZK DApp.');

  const authToken = getRemixAccessToken();
  const zkverifyEndpoint = getZkVerifyEndpoint();

  const response = await fetch(`${zkverifyEndpoint}/seal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify({
      apiKey,
      network
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Could not prepare zkVerify proxy token: ${errorText}`);
  }

  const data = await response.json();
  if (!data?.token) throw new Error('Could not prepare zkVerify proxy token.');
  return data.token;
};

export interface ZkRuntimeConfig {
  circuitName: string;
  provingScheme: 'groth16';
  primeValue: 'bn128' | 'bls12381';
  signalInputs: string[];
  zkArtifacts: {
    wasmPath: string;
    zkeyPath: string;
    vkeyPath: string;
  };
  zkVerify: {
    network: 'testnet' | 'mainnet';
    apiKey?: string;
    proxyEndpoint?: string;
    proxyToken?: string;
  };
}

/**
 * Build the ZK DApp runtime configuration script.
 * Injected into the HTML as window.__ZK_DAPP_CONFIG__
 */
export const buildZkRuntimeConfigScript = async (
  plugin: any,
  activeDapp: any,
  options: { includeApiKey: boolean; target: 'preview' | 'ipfs-deploy' }
): Promise<string> => {
  const zkCircuit = getZkCircuitConfig(activeDapp);
  if (!zkCircuit) return '';

  const network = zkCircuit.zkVerifyConfig?.network || await getZkVerifyNetwork(plugin);
  let apiKey = await getZkVerifyApiKey(plugin);
  let proxyToken: string | undefined;
  let proxyEndpoint: string | undefined;

  // For deployment, create a sealed proxy token instead of exposing the API key
  const zkverifyEndpoint = getZkVerifyEndpoint();

  if (!options.includeApiKey && apiKey) {
    try {
      proxyToken = await createZkVerifyProxyToken(apiKey, network);
      proxyEndpoint = `${zkverifyEndpoint}/submit-proof`;
      apiKey = ''; // Clear API key for deployed version
    } catch (error: any) {
      // Continue without proxy token - DApp will need manual API key
    }
  }

  // For IPFS deployment, use root-level paths since IPFS endpoint doesn't support subdirectories.
  // For preview, the built DApp runs in an iframe with no real origin backing it, so relative
  // paths can't be fetched from the Remix filesystem - embed the artifacts as data URLs instead.
  let zkArtifacts: ZkRuntimeConfig['zkArtifacts'];

  if (options.target === 'ipfs-deploy') {
    zkArtifacts = {
      wasmPath: 'circuit.wasm',
      zkeyPath: 'circuit.zkey',
      vkeyPath: 'verification_key.json'
    };
  } else {
    const wasmPath = zkCircuit.zkArtifacts?.wasmPath || 'zk/circuit.wasm';
    const zkeyPath = zkCircuit.zkArtifacts?.zkeyPath || 'zk/circuit.zkey';
    const vkeyPath = zkCircuit.zkArtifacts?.vkeyPath || 'zk/verification_key.json';

    const [wasmDataUrl, zkeyDataUrl, vkeyDataUrl] = await Promise.all([
      readFileAsDataUrl(plugin, wasmPath, 'application/wasm'),
      readFileAsDataUrl(plugin, zkeyPath, 'application/octet-stream'),
      readFileAsDataUrl(plugin, vkeyPath, 'application/json')
    ]);

    zkArtifacts = {
      wasmPath: wasmDataUrl || wasmPath,
      zkeyPath: zkeyDataUrl || zkeyPath,
      vkeyPath: vkeyDataUrl || vkeyPath
    };
  }

  const runtimeConfig: ZkRuntimeConfig = {
    circuitName: zkCircuit.circuitName,
    provingScheme: zkCircuit.provingScheme,
    primeValue: zkCircuit.primeValue,
    signalInputs: zkCircuit.signalInputs || [],
    zkArtifacts,
    zkVerify: {
      network,
      ...(options.includeApiKey && apiKey ? { apiKey } : {}),
      ...(proxyEndpoint ? { proxyEndpoint } : {}),
      ...(proxyToken ? { proxyToken } : {})
    }
  };

  return `<script>window.__ZK_DAPP_CONFIG__=${safeScriptJson(runtimeConfig)};</script>`;
};

/**
 * Get zkVerify-related sources from a DApp config for display purposes.
 */
export const getZkDappSummary = (activeDapp: any): {
  hasZkCircuit: boolean;
  circuitName?: string;
  provingScheme?: string;
  signalCount?: number;
} => {
  const zkCircuit = getZkCircuitConfig(activeDapp);
  if (!zkCircuit) {
    return { hasZkCircuit: false };
  }

  return {
    hasZkCircuit: true,
    circuitName: zkCircuit.circuitName,
    provingScheme: zkCircuit.provingScheme,
    signalCount: zkCircuit.signalInputs?.length || 0
  };
};
