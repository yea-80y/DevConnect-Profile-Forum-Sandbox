// Wallet connection utilities
// Simple functions to check and request wallet connection

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

function getEthereum(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as any).ethereum;
}

/**
 * Check if wallet is currently connected
 * Returns true if wallet has connected accounts
 */
export async function isWalletConnected(): Promise<boolean> {
  const ethereum = getEthereum();
  if (!ethereum) {
    console.log('[wallet] No ethereum provider found');
    return false;
  }

  try {
    // Step 1: Check if there are any connected accounts
    const accounts = await ethereum.request({ method: 'eth_accounts' }) as string[];
    if (!accounts || accounts.length === 0) {
      console.log('[wallet] No accounts connected');
      return false;
    }

    // Step 2: Verify wallet is actually unlocked by requesting permissions
    // This is more reliable than isUnlocked() which can return stale data
    try {
      const permissions = await ethereum.request({
        method: 'wallet_getPermissions'
      }) as any[];

      // If we can get permissions, wallet is unlocked
      const hasEthAccounts = permissions.some(p => p.parentCapability === 'eth_accounts');
      console.log('[wallet] Connection check:', {
        accounts: accounts.length,
        hasPermissions: hasEthAccounts,
        connected: hasEthAccounts
      });
      return hasEthAccounts;
    } catch (permError) {
      // If wallet_getPermissions fails, wallet is likely locked
      console.log('[wallet] Wallet appears locked (permissions check failed):', permError);
      return false;
    }
  } catch (error) {
    console.error('[wallet] Error checking connection:', error);
    return false;
  }
}

/**
 * Request wallet connection (prompts user)
 * Returns true if connection successful
 */
export async function requestWalletConnection(): Promise<boolean> {
  const ethereum = getEthereum();
  if (!ethereum) {
    console.error('[wallet] No wallet provider found');
    return false;
  }

  try {
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
    return accounts && accounts.length > 0;
  } catch (error) {
    console.error('[wallet] Connection request failed:', error);
    return false;
  }
}

/**
 * Get the ethereum provider (for event listeners)
 */
export function getWalletProvider(): EthereumProvider | undefined {
  return getEthereum();
}
