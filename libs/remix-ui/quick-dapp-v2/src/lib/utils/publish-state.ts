import type { DappConfig } from '../types';

export type QuickDappPublishState = 'created' | 'published' | 'published-with-unpublished-changes';

export const getQuickDappPublishState = (
  dapp: Pick<DappConfig, 'deployment'> | null | undefined
): QuickDappPublishState => {
  if (!dapp?.deployment?.ipfsCid) return 'created';
  return dapp.deployment.hasUnpublishedChanges
    ? 'published-with-unpublished-changes'
    : 'published';
};

export const getQuickDappPublishLabel = (
  dapp: Pick<DappConfig, 'deployment'> | null | undefined
): string => {
  const state = getQuickDappPublishState(dapp);
  if (state === 'published-with-unpublished-changes') return 'Published · Unpublished changes';
  return state === 'published' ? 'Published' : 'Created';
};
