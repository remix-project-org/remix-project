export default async () => {
  return {
    // @ts-ignore
    'scripts/group-creation-tx.ts': (await import('!!raw-loader!./scripts/group-creation-tx.ts')).default,
    // @ts-ignore
    'scripts/create-group.ts': (await import('!!raw-loader!./scripts/create-group.ts')).default,
    // @ts-ignore
    'scripts/invite-to-group.ts': (await import('!!raw-loader!./scripts/invite-to-group.ts')).default,
    // @ts-ignore
    'scripts/pathfinder.ts': (await import('!!raw-loader!./scripts/pathfinder.ts')).default,
    // @ts-ignore
    'scripts/set-owner.ts': (await import('!!raw-loader!./scripts/set-owner.ts')).default,
    // @ts-ignore
    'scripts/user.ts': (await import('!!raw-loader!./scripts/user.ts')).default,
    // @ts-ignore
    '.prettierrc.json': (await import('raw-loader!./.prettierrc')).default,
    // @ts-ignore
    'README.md': (await import('raw-loader!./README.md')).default
  }
}