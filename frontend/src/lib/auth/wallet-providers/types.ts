/**
 * Wallet provider abstraction
 * Supports MetaMask, Para wallet, and other providers
 */

export type WalletProviderType = "metamask" | "para" | "walletconnect" | "coinbase";

export interface WalletProvider {
  type: WalletProviderType;
  name: string;
  icon?: string;
  isAvailable: () => boolean | Promise<boolean>;
  connect: () => Promise<WalletConnection>;
  signMessage: (message: string) => Promise<string>;
  signTypedData: (domain: unknown, types: unknown, value: unknown) => Promise<string>;
}

export interface WalletConnection {
  address: string;
  provider: unknown; // EIP-1193 provider or Para provider
}

/**
 * Para wallet specific types
 */
export interface ParaWalletConfig {
  apiEndpoint: string;
  appId: string;
}

export interface ParaAuthFlow {
  step: "email" | "otp" | "complete";
  email?: string;
  sessionId?: string;
}
