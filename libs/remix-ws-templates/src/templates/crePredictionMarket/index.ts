export default async (opts, plugin) => {
  return {
    // @ts-ignore
    'contracts/WorldCupPredictionMarket.sol': (await import('raw-loader!./contracts/WorldCupPredictionMarket.sol')).default,
    // @ts-ignore
    'contracts/interfaces/ReceiverTemplate.sol': (await import('raw-loader!./contracts/interfaces/ReceiverTemplate.sol')).default,
    // @ts-ignore
    'README.md': (await import('raw-loader!./README.md')).default,
    // @ts-ignore
    '.env.example': (await import('raw-loader!./.env.example')).default,
    // @ts-ignore
    '.gitignore': (await import('raw-loader!./.gitignore')).default,
    // @ts-ignore
    'project.yaml': (await import('raw-loader!./project.yaml')).default,
    // @ts-ignore
    'secrets.yaml': (await import('raw-loader!./secrets.yaml')).default,
    // @ts-ignore
    'CRE-world-cup-prediction-market.json': JSON.stringify((await import('./CRE-world-cup-prediction-market.json')).default, null, 2),
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default,
    // @ts-ignore
    'cre-workflow/main.ts': (await import('!!raw-loader!./cre-workflow/main.ts')).default,
    // @ts-ignore
    'cre-workflow/evm.ts': (await import('!!raw-loader!./cre-workflow/evm.ts')).default,
    // @ts-ignore
    'cre-workflow/types.ts': (await import('!!raw-loader!./cre-workflow/types.ts')).default,
    // @ts-ignore
    'cre-workflow/workflow.yaml': (await import('raw-loader!./cre-workflow/workflow.yaml')).default,
    // @ts-ignore
    'cre-workflow/config.json': JSON.stringify((await import('./cre-workflow/config.json')).default, null, 2),
    // @ts-ignore
    'cre-workflow/package.json': JSON.stringify((await import('./cre-workflow/package.json')).default, null, 2),
    // @ts-ignore
    'cre-workflow/tsconfig.json': JSON.stringify((await import('./cre-workflow/tsconfig.json')).default, null, 2),
    // @ts-ignore
    'cre-workflow/bun.lock': (await import('raw-loader!./cre-workflow/bun.lock')).default,
    // @ts-ignore
    'frontend/index.html': (await import('raw-loader!./frontend/index.html')).default,
    // @ts-ignore
    'frontend/package.json': JSON.stringify((await import('./frontend/package.json')).default, null, 2),
    // @ts-ignore
    'frontend/vite.config.ts': (await import('!!raw-loader!./frontend/vite.config.ts')).default,
    // @ts-ignore
    'frontend/tsconfig.json': JSON.stringify((await import('./frontend/tsconfig.json')).default, null, 2),
    // @ts-ignore
    'frontend/tsconfig.node.json': JSON.stringify((await import('./frontend/tsconfig.node.json')).default, null, 2),
    // @ts-ignore
    'frontend/.env.example': (await import('raw-loader!./frontend/.env.example')).default,
    // @ts-ignore
    'frontend/src/main.tsx': (await import('!!raw-loader!./frontend/src/main.tsx')).default,
    // @ts-ignore
    'frontend/src/App.tsx': (await import('!!raw-loader!./frontend/src/App.tsx')).default,
    // @ts-ignore
    'frontend/src/vite-env.d.ts': (await import('!!raw-loader!./frontend/src/vite-env.d.ts')).default,
    // @ts-ignore
    'frontend/src/pages/Home.tsx': (await import('!!raw-loader!./frontend/src/pages/Home.tsx')).default,
    // @ts-ignore
    'frontend/src/pages/Market.tsx': (await import('!!raw-loader!./frontend/src/pages/Market.tsx')).default,
    // @ts-ignore
    'frontend/src/components/Header.tsx': (await import('!!raw-loader!./frontend/src/components/Header.tsx')).default,
    // @ts-ignore
    'frontend/src/components/MatchMarkets.tsx': (await import('!!raw-loader!./frontend/src/components/MatchMarkets.tsx')).default,
    // @ts-ignore
    'frontend/src/components/MarketCard.tsx': (await import('!!raw-loader!./frontend/src/components/MarketCard.tsx')).default,
    // @ts-ignore
    'frontend/src/components/PlaceBetModal.tsx': (await import('!!raw-loader!./frontend/src/components/PlaceBetModal.tsx')).default,
    // @ts-ignore
    'frontend/src/lib/client.ts': (await import('!!raw-loader!./frontend/src/lib/client.ts')).default,
    // @ts-ignore
    'frontend/src/lib/contract.ts': (await import('!!raw-loader!./frontend/src/lib/contract.ts')).default,
    // @ts-ignore
    'frontend/src/lib/hooks.ts': (await import('!!raw-loader!./frontend/src/lib/hooks.ts')).default,
    // @ts-ignore
    'frontend/src/lib/matches.ts': (await import('!!raw-loader!./frontend/src/lib/matches.ts')).default,
    // @ts-ignore
    'frontend/src/lib/wallet.tsx': (await import('!!raw-loader!./frontend/src/lib/wallet.tsx')).default
  }
}