import { ProvingScheme, PrimeValue, ZkVerifyNetwork } from './dapp';

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
