export const scriptTemplates = [
  {
    templateName: 'runSlitherAction',
    templateArtefact: { files: ['.github/workflows/run-slither-action.yml']}
  },
  {
    templateName: 'sindriScripts',
    templateArtefact: {
      files: ['scripts/sindri/run_compile.ts', 'scripts/sindri/run_prove.ts', 'scripts/sindri/utils.ts']
    }
  },
  {
    templateName: 'contractCreate2Factory',
    templateArtefact: {
      files: ['contracts/libs/create2-factory.sol']
    }
  },
  {
    templateName: 'contractDeployerScripts',
    templateArtefact: { files: ['scripts/contract-deployer/basic-contract-deploy.ts', 'scripts/contract-deployer/create2-factory-deploy.ts']}
  },
  {
    templateName: 'etherscanScripts',
    templateArtefact: {
      files: ['scripts/etherscan/verifyScript.ts', 'scripts/etherscan/receiptGuidScript.ts']
    }
  },
  {
    templateName: 'runJsTestAction',
    templateArtefact: { files: ['.github/workflows/run-js-test.yml']}
  },
  {
    templateName: 'runSolidityUnittestingAction',
    templateArtefact: { files: ['.github/workflows/run-solidity-unittesting.yml']}
  }
]
