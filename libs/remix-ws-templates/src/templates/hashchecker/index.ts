export default async () => {
  return {
    // @ts-ignore
    'circuits/calculate_hash.circom': (await import('raw-loader!./circuits/calculate_hash.circom')).default,
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
    'README.md': (await import('raw-loader!./README.md')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default
  }
}