export { RemixURLResolver } from './resolve'
export { githubFolderResolver } from './github-folder-resolver'

type EndpointUrls = {
    ipfsGateway: string;
    ghfolderpull: string;
};

const defaultUrls: EndpointUrls = {
  ipfsGateway: 'https://api.remix.live/endpoints/jqgt',
  ghfolderpull: 'https://api.remix.live/endpoints/ghfolderpull',
};

const endpointPathMap: Record<keyof EndpointUrls, string> = {
  ipfsGateway: 'endpoints/jqgt',
  ghfolderpull: 'endpoints/ghfolderpull',
};

const prefix = null;

const resolvedUrls: EndpointUrls = prefix
  ? Object.fromEntries(
    Object.entries(defaultUrls).map(([key, _]) => [
      key,
      `${prefix}/${endpointPathMap[key as keyof EndpointUrls]}`,
    ])
  ) as EndpointUrls
  : defaultUrls;

export const endpointUrls = resolvedUrls;
