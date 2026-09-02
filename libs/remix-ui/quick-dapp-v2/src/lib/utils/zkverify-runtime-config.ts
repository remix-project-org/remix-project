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
  if (!zkCircuit) return false;
  if (zkCircuit.circuitType === 'noir') return true;
  return zkCircuit.provingScheme === 'groth16' || zkCircuit.provingScheme === 'plonk';
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
  provingScheme: 'groth16' | 'plonk';
  primeValue: 'bn128' | 'bls12381';
  signalInputs: string[];
  zkArtifacts: {
    wasmPath: string;
    zkeyPath: string;
    vkeyPath: string;
  };
  verificationMethod: 'zkverify' | 'onchain';
  zkVerify?: {
    network: 'testnet' | 'mainnet';
    apiKey?: string;
    proxyEndpoint?: string;
    proxyToken?: string;
  };
  onChainVerifier?: {
    address: string;
    abi: any[];
    chainId: number | string;
  };
}

export interface NoirZkRuntimeConfig {
  circuitType: 'noir';
  circuitName: string;
  backendUrl: string;
  wsUrl: string;
  nargoToml: string;
  programJson: string;
  circuitSource: { path: string; content: string }[];
  verificationMethod: 'onchain';
  onChainVerifier?: {
    address: string;
    abi: any[];
    chainId: number | string;
  };
}

/**
 * Build the runtime config for a Noir ZK DApp - text-only artifacts (no wasm/zkey blobs),
 * since proving happens via a round-trip to the external Noir backend, not in-browser wasm.
 */
const buildNoirZkRuntimeConfigScript = async (plugin: any, zkCircuit: any): Promise<string> => {
  const noirArtifacts = zkCircuit.noirArtifacts || {};

  const [nargoToml, programJson] = await Promise.all([
    plugin.call('fileManager', 'readFile', noirArtifacts.nargoTomlPath).catch(() => ''),
    plugin.call('fileManager', 'readFile', noirArtifacts.programJsonPath).catch(() => '')
  ]);

  const circuitSourcePaths: string[] = noirArtifacts.circuitSourcePaths || [];
  const circuitSource = await Promise.all(
    circuitSourcePaths.map(async (path) => ({
      path,
      content: await plugin.call('fileManager', 'readFile', path).catch(() => '')
    }))
  );

  const runtimeConfig: NoirZkRuntimeConfig = {
    circuitType: 'noir',
    circuitName: zkCircuit.circuitName,
    backendUrl: noirArtifacts.backendUrl || '',
    wsUrl: noirArtifacts.wsUrl || '',
    nargoToml: nargoToml || '',
    programJson: programJson || '',
    circuitSource,
    verificationMethod: 'onchain',
    ...(zkCircuit.onChainVerifier ? {
      onChainVerifier: {
        address: zkCircuit.onChainVerifier.address,
        abi: zkCircuit.onChainVerifier.abi,
        chainId: zkCircuit.onChainVerifier.chainId
      }
    } : {})
  };

  return `<script>window.__ZK_DAPP_CONFIG__=${safeScriptJson(runtimeConfig)};</script>`;
};

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

  if (zkCircuit.circuitType === 'noir') {
    return buildNoirZkRuntimeConfigScript(plugin, zkCircuit);
  }

  const verificationMethod: 'zkverify' | 'onchain' = zkCircuit.verificationMethod || 'zkverify';

  let zkVerify: ZkRuntimeConfig['zkVerify'];

  if (verificationMethod === 'zkverify') {
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

    zkVerify = {
      network,
      ...(options.includeApiKey && apiKey ? { apiKey } : {}),
      ...(proxyEndpoint ? { proxyEndpoint } : {}),
      ...(proxyToken ? { proxyToken } : {})
    };
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
    verificationMethod,
    ...(zkVerify ? { zkVerify } : {}),
    ...(verificationMethod === 'onchain' && zkCircuit.onChainVerifier ? {
      onChainVerifier: {
        address: zkCircuit.onChainVerifier.address,
        abi: zkCircuit.onChainVerifier.abi,
        chainId: zkCircuit.onChainVerifier.chainId
      }
    } : {})
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
  verificationMethod?: 'zkverify' | 'onchain';
  onChainVerifier?: { address: string; chainId: number | string; networkName?: string };
} => {
  const zkCircuit = getZkCircuitConfig(activeDapp);
  if (!zkCircuit) {
    return { hasZkCircuit: false };
  }

  if (zkCircuit.circuitType === 'noir') {
    return {
      hasZkCircuit: true,
      circuitName: zkCircuit.circuitName,
      provingScheme: 'noir',
      verificationMethod: 'onchain',
      onChainVerifier: zkCircuit.onChainVerifier
        ? { address: zkCircuit.onChainVerifier.address, chainId: zkCircuit.onChainVerifier.chainId, networkName: zkCircuit.onChainVerifier.networkName }
        : undefined
    };
  }

  return {
    hasZkCircuit: true,
    circuitName: zkCircuit.circuitName,
    provingScheme: zkCircuit.provingScheme,
    signalCount: zkCircuit.signalInputs?.length || 0,
    verificationMethod: zkCircuit.verificationMethod || 'zkverify',
    onChainVerifier: zkCircuit.onChainVerifier
      ? { address: zkCircuit.onChainVerifier.address, chainId: zkCircuit.onChainVerifier.chainId, networkName: zkCircuit.onChainVerifier.networkName }
      : undefined
  };
};
