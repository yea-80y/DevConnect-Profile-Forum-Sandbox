"use client";

import { useEffect, useState } from "react";
import { isWalletConnected, requestWalletConnection, getWalletProvider } from "./connection";

/**
 * Hook to monitor wallet connection status
 *
 * Features:
 * - Checks connection on mount (Layer 2: page load check)
 * - Listens to wallet events for instant detection (Layer 1: event listeners)
 * - Provides reconnect function
 *
 * Usage:
 * const { isConnected, reconnect } = useWalletConnection();
 */
export function useWalletConnection() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null); // null = checking

  // Check connection status
  const checkConnection = async () => {
    const connected = await isWalletConnected();
    setIsConnected(connected);
    return connected;
  };

  // Layer 2: Check on mount (page load)
  useEffect(() => {
    checkConnection();
  }, []);

  // Layer 1: Listen to wallet events (instant detection)
  useEffect(() => {
    const ethereum = getWalletProvider();
    if (!ethereum || !ethereum.on) return;

    const handleAccountsChanged = async (accounts: unknown) => {
      const accountsArray = accounts as string[];
      if (!accountsArray || accountsArray.length === 0) {
        console.log('[wallet] Accounts changed: disconnected');
        setIsConnected(false);
        return;
      }
      // Re-check if wallet is unlocked (not just if accounts exist)
      const connected = await checkConnection();
      console.log('[wallet] Accounts changed:', connected ? 'connected & unlocked' : 'connected but locked');
    };

    const handleDisconnect = () => {
      console.log('[wallet] Disconnect event');
      setIsConnected(false);
    };

    // MetaMask-specific: listen for lock/unlock events
    const handleLockStateChanged = async () => {
      console.log('[wallet] Lock state changed');
      await checkConnection();
    };

    // Listen to events
    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('disconnect', handleDisconnect);

    // MetaMask emits this when locked/unlocked
    const metamask = (ethereum as any)._metamask;
    if (metamask && metamask.on) {
      metamask.on('unlockStateChanged', handleLockStateChanged);
    }

    // Cleanup
    return () => {
      if (ethereum.removeListener) {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
        ethereum.removeListener('disconnect', handleDisconnect);
      }
      if (metamask && metamask.removeListener) {
        metamask.removeListener('unlockStateChanged', handleLockStateChanged);
      }
    };
  }, [checkConnection]);

  // Reconnect function
  const reconnect = async () => {
    const success = await requestWalletConnection();
    if (success) {
      setIsConnected(true);
    }
    return success;
  };

  return {
    isConnected, // null = checking, true = connected, false = disconnected
    reconnect,
    checkConnection, // Manual check if needed
  };
}
