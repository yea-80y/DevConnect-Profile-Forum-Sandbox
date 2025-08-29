// src/lib/demoAccount.ts
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const KEY = 'devconnect_demo_pk';

export type DemoAccount = {
  privateKey: `0x${string}`;
  address: `0x${string}`;
};

export function getOrCreateDemoAccount(): DemoAccount {
  let pk = (typeof window !== 'undefined' && localStorage.getItem(KEY)) as `0x${string}` | null;

  if (!pk) {
    pk = generatePrivateKey();
    localStorage.setItem(KEY, pk);
  }

  const acct = privateKeyToAccount(pk);
  return { privateKey: pk, address: acct.address };
}
