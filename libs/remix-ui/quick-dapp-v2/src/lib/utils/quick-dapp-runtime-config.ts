import { getPrimaryQuickDappContract, getQuickDappContracts } from '@remix-ui/helper';
import type { DappConfig } from '../types';

interface QuickDappRuntimeDisplayConfig {
  logo?: string;
  title?: string;
  details?: string;
}

const buildQuickDappRuntimeConfig = (
  dapp: DappConfig | null | undefined,
  display: QuickDappRuntimeDisplayConfig
) => {
  const runtimeConfig: Record<string, any> = {
    logo: display.logo || '',
    title: display.title || '',
    details: display.details || ''
  };
  const hasContractBindings = Array.isArray(dapp?.contracts) && dapp.contracts.length > 0;
  const contracts = hasContractBindings ? getQuickDappContracts(dapp) : [];
  const primary = hasContractBindings ? getPrimaryQuickDappContract(dapp) : undefined;

  if (contracts.length > 0 && primary) {
    runtimeConfig.contracts = contracts.map((contract) => ({
      id: contract.id,
      alias: contract.alias,
      name: contract.name,
      address: contract.address,
      abi: contract.abi,
      chainId: contract.chainId,
      networkName: contract.networkName
    }));
    runtimeConfig.primaryContractId = primary.id;
  }

  return runtimeConfig;
};

const serializeQuickDappRuntimeConfig = (value: any): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

export const buildQuickDappRuntimeConfigScript = (
  dapp: DappConfig | null | undefined,
  display: QuickDappRuntimeDisplayConfig
): string => `<script>window.__QUICK_DAPP_CONFIG__=${serializeQuickDappRuntimeConfig(buildQuickDappRuntimeConfig(dapp, display))};</script>`;
