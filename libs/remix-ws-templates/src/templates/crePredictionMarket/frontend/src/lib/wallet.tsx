import { createContext, useCallback, useContext, useState } from "react";
import { createWalletClient, custom, type WalletClient } from "viem";
import { sepolia } from "viem/chains";

interface WalletContextValue {
  address: `0x${string}` | null;
  walletClient: WalletClient | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue>({
  address: null,
  walletClient: null,
  isConnected: false,
  connect: async () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("Please install MetaMask or another Web3 wallet.");
      return;
    }
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as `0x${string}`[];

    const client = createWalletClient({
      account: accounts[0],
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    setAddress(accounts[0]);
    setWalletClient(client);

    // Sync on account/chain change
    window.ethereum.on("accountsChanged", (accs: `0x${string}`[]) => {
      if (accs.length === 0) { setAddress(null); setWalletClient(null); }
      else setAddress(accs[0]);
    });
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setWalletClient(null);
  }, []);

  return (
    <WalletContext.Provider value={{ address, walletClient, isConnected: !!address, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
