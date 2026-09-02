import { ProvingScheme, PrimeValue, ZkVerifyNetwork, ZkVerificationMethod, ZkOnChainVerifierConfig } from './dapp';

export interface CreateZkDappPayload {
  circuitName: string;
  circuitPath: string;
  provingScheme: ProvingScheme;
  primeValue: PrimeValue;
  signalInputs: string[];
  wasmPath: string;
  zkeyPath: string;
  verificationKey: Record<string, any>;
  zkVerifyNetwork?: ZkVerifyNetwork;
  userDescription?: string;
  verificationMethod?: ZkVerificationMethod;
  onChainVerifier?: ZkOnChainVerifierConfig;
}

export interface CreateNoirZkDappPayload {
  circuitName: string;
  circuitPath: string;
  nargoTomlPath: string;
  circuitSourcePaths: string[];
  proverTomlPath: string;
  programJsonPath: string;
  verifierContractPath: string;
  backendUrl: string;
  wsUrl: string;
  userDescription?: string;
  onChainVerifier?: ZkOnChainVerifierConfig;
}

export interface ZkProofResult {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals: string[];
}

export interface ZkVerifySubmissionResult {
  success: boolean;
  jobId: string;
  status: string;
  attestationId?: string;
  transactionHash?: string;
  network: ZkVerifyNetwork;
  error?: string;
}
