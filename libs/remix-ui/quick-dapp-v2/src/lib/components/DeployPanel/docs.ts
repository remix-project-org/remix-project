import type { DappConfig, QuickDappGraphContext } from '../../types/dapp';

export const DOCS_FILENAME = 'dapp-docs.md';

const SENSITIVE_KEY = /(api[_-]?key|access[_-]?token|auth[_-]?token|authorization|bearer|client[_-]?secret|mnemonic|password|private[_-]?key|refresh[_-]?token|secret|seed)/i;

export const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return 'Not available';
  return new Date(timestamp).toLocaleString();
};

export const getDappMode = (dapp: DappConfig) => dapp.mode || ((dapp as any).inlineMode ? 'inline' : 'workspace');

export const getDappSourceRoot = (dapp: DappConfig) => getDappMode(dapp) === 'inline' ? '/frontend' : '/';

export const redactUrlSecrets = (value?: string) => {
  if (!value) return value;

  try {
    const url = new URL(value);
    url.searchParams.forEach((_paramValue, key) => {
      if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, 'REDACTED');
    });
    return url.toString();
  } catch (e) {
    return value.replace(/([?&][^=]*(?:api[_-]?key|token|secret|auth|authorization)[^=]*=)[^&\s'"]+/gi, '$1REDACTED');
  }
};

export const getGraphSources = (dapp?: DappConfig | null): QuickDappGraphContext[] => {
  const sources = dapp?.dataSources?.theGraph;
  return Array.isArray(sources) ? sources : [];
};

export const getAppKindLabel = (dapp: DappConfig) => {
  const hasGraph = getGraphSources(dapp).length > 0;
  if (dapp.appKind === 'graph-only') return 'Graph-only DApp';
  if (hasGraph) return 'Contract + The Graph';
  return 'Contract DApp';
};
