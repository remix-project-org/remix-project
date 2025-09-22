export default async () => {
  return {
    // @ts-ignore
    'circuits/rln.circom': (await import('raw-loader!./circuits/rln.circom')).default,
    // @ts-ignore
    'circuits/utils.circom': (await import('!!raw-loader!./circuits/utils.circom')).default,
    // @ts-ignore
    'circuits/withdraw.circom': (await import('!!raw-loader!./circuits/withdraw.circom')).default,
    // @ts-ignore
    'scripts/groth16/groth16_trusted_setup.ts': (await import('!!raw-loader!./scripts/groth16/groth16_trusted_setup.ts')).default,
    // @ts-ignore
    'scripts/groth16/groth16_zkproof.ts': (await import('!!raw-loader!./scripts/groth16/groth16_zkproof.ts')).default,
    // @ts-ignore
    'scripts/plonk/plonk_trusted_setup.ts': (await import('!!raw-loader!./scripts/plonk/plonk_trusted_setup.ts')).default,
    // @ts-ignore
    'scripts/plonk/plonk_zkproof.ts': (await import('!!raw-loader!./scripts/plonk/plonk_zkproof.ts')).default,
    // @ts-ignore
    'templates/groth16_verifier.sol.ejs': (await import('!!raw-loader!./templates/groth16_verifier.sol.ejs')).default,
    // @ts-ignore
    'templates/plonk_verifier.sol.ejs': (await import('!!raw-loader!./templates/plonk_verifier.sol.ejs')).default,
    // @ts-ignore
    'LICENSE-APACHE': (await import('!!raw-loader!./LICENSE-APACHE')).default,
    // @ts-ignore
    'LICENSE-MIT': (await import('!!raw-loader!./LICENSE-MIT')).default,
    // @ts-ignore
    'README.md': (await import('raw-loader!./README.md')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default
  }
}