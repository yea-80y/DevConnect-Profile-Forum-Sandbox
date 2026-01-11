# WoCo Authentication System

Modular, wallet-agnostic authentication supporting MetaMask, Para wallet, and lazy signature loading.

## 📁 Architecture

```
lib/auth/
├── types.ts                    # Shared TypeScript types
├── constants.ts                # EIP-712 domains, nonces, config
│
├── storage/
│   ├── indexeddb.ts           # IndexedDB operations
│   └── encryption.ts          # AES-GCM device-bound encryption
│
├── signatures/
│   ├── posting-capability.ts  # Forum posting EIP-712
│   ├── pod-identity.ts        # POD identity EIP-712 (deterministic)
│   └── verification.ts        # Signature verification helpers
│
├── flows/
│   ├── web3-login.ts          # Instant web3 login (no signatures!)
│   ├── request-posting.ts     # Lazy posting capability request
│   └── request-pod.ts         # Lazy POD identity request
│
├── wallet-providers/
│   └── types.ts               # Wallet provider abstraction (MetaMask, Para, etc.)
│
├── components/
│   ├── WalletSelector.tsx     # Choose MetaMask or Para wallet
│   ├── ParaAuthFlow.tsx       # Email + OTP flow (Para wallet)
│   ├── PostingAuthPrompt.tsx  # Posting authorization prompt (MetaMask)
│   └── PodIdentityPrompt.tsx  # POD identity setup prompt (MetaMask)
│
└── usePostingIdentity.tsx     # Main auth hook (orchestrator)
```

## 🔑 Key Features

### 1. **Lazy Signature Loading**
- Login requires NO signatures
- Signatures requested only when needed:
  - **Posting capability** → when user tries to post
  - **POD identity** → when user tries to create/claim PODs

### 2. **Wallet-Agnostic**
- **MetaMask/Standard wallets** → EIP-1193 provider signatures
- **Para wallet** → Email + OTP account creation
- Easy to add more wallet types (WalletConnect, Coinbase, etc.)

### 3. **Deterministic POD Identity**
- Same wallet → same POD key across all devices
- Uses fixed nonce EIP-712 signature
- Cross-device portable, recoverable

### 4. **Modular Design**
- Each module < 200 lines
- Unit testable
- Clear separation of concerns
- Easy to maintain and extend

## 🚀 User Flows

### MetaMask Flow

```
1. Login (instant - no signatures!)
   User clicks "Connect with MetaMask"
     ↓
   Just connect wallet
     ↓
   ✅ Logged in (can view content)

2. First Post (lazy - request when needed)
   User writes message, clicks "Post"
     ↓
   App shows PostingAuthPrompt
     ↓
   User clicks "Authorize Posting"
     ↓
   MetaMask signature request (EIP-712)
     ↓
   ✅ Post submitted

3. First POD Creation (lazy - request when needed)
   User fills form, clicks "Create Collectible"
     ↓
   App shows PodIdentityPrompt
     ↓
   User clicks "Generate POD Identity"
     ↓
   MetaMask signature request (EIP-712, deterministic)
     ↓
   ✅ POD created
```

### Para Wallet Flow

```
1. Login (email-based account creation)
   User clicks "Connect with Para Wallet"
     ↓
   App shows ParaAuthFlow (email step)
     ↓
   User enters email, clicks "Continue"
     ↓
   OTP sent to email
     ↓
   User enters OTP, clicks "Verify"
     ↓
   Para API creates wallet account
     ↓
   ✅ Logged in with new crypto account

2. Posting/PODs (same as MetaMask after login)
   Same lazy loading flow
   Para wallet signs EIP-712 messages programmatically
```

## 🔒 Security

### Encryption
- **Device-bound AES-256-GCM key** (non-extractable)
- All credentials encrypted in IndexedDB
- Separate encryption for:
  - Posting keystore
  - Posting capability
  - POD seed

### Signature Verification
- EIP-712 domain separation
- Host scope validation (prevents cross-domain attacks)
- Expiry checks (capabilities expire after 1 year)
- Safe proof verification (possession proof)

### Deterministic POD Identity
- Fixed nonce: `"WOCO-POD-IDENTITY-V1"`
- Same wallet → same signature → same POD key
- Portable across devices
- Recoverable with wallet alone

## 📦 Usage

### Import Components

```typescript
import {
  WalletSelector,
  ParaAuthFlow,
  PostingAuthPrompt,
  PodIdentityPrompt,
} from "@/lib/auth/components";
```

### Import Flow Functions

```typescript
import { startWeb3Login } from "@/lib/auth/flows/web3-login";
import { requestPostingCapability } from "@/lib/auth/flows/request-posting";
import { requestPodIdentity } from "@/lib/auth/flows/request-pod";
```

### Import Signature Helpers

```typescript
import {
  requestPostingCapabilitySignature,
} from "@/lib/auth/signatures/posting-capability";

import {
  requestPodIdentitySignature,
  derivePodSeedFromSignature,
} from "@/lib/auth/signatures/pod-identity";

import {
  verifyCapabilityLocal,
  capabilityId,
} from "@/lib/auth/signatures/verification";
```

### Use Main Hook

```typescript
import { usePostingIdentity } from "@/lib/auth/usePostingIdentity";

function MyComponent() {
  const id = usePostingIdentity();

  // Login (instant!)
  const handleLogin = async () => {
    await id.startWeb3Login();
  };

  // Post to forum (lazy capability request)
  const handlePost = async (message: string) => {
    if (id.postAuth === "blocked") {
      await id.requestPostingCapability(); // Shows prompt + signature
    }
    const signature = await id.signPost(message);
    // Submit post...
  };

  // Create POD (lazy identity request)
  const handleCreatePOD = async (data: CollectibleData) => {
    const wallet = await id.getWalletForPOD();
    if (!wallet?.seed) {
      await id.requestPodIdentity(); // Shows prompt + signature
    }
    // Create POD...
  };
}
```

## 🔧 Configuration

### EIP-712 Domains

```typescript
// Posting capability domain
export const CAP_DOMAIN = {
  name: "WoCo Capability",
  version: "1"
};

// POD identity domain (separate for security)
export const POD_IDENTITY_DOMAIN = {
  name: "WoCo POD Identity",
  version: "1"
};
```

### Fixed Nonce (Deterministic POD)

```typescript
export const POD_IDENTITY_NONCE = "WOCO-POD-IDENTITY-V1";
```

### IndexedDB Keys

```typescript
export const K_DEVICE_KEY = "woco:deviceKey";
export const K_ENC_KEYSTORE = "woco:encKeystore";
export const K_ENC_CAP = "woco:encCap";
export const K_POD_SEED = "woco:podSeed";
export const K_KIND = "woco:kind";
```

## 🎨 UI Components

All components follow the existing UI pattern:
- Tailwind CSS styling
- Dark mode support
- Loading states
- Error handling
- Accessible (keyboard navigation, ARIA)

### Component Props

```typescript
// WalletSelector
interface WalletSelectorProps {
  isOpen: boolean;
  onSelectMetaMask: () => void;
  onSelectPara: () => void;
  onCancel: () => void;
}

// ParaAuthFlow
interface ParaAuthFlowProps {
  isOpen: boolean;
  onComplete: (address: string) => void;
  onCancel: () => void;
}

// PostingAuthPrompt
interface PostingAuthPromptProps {
  isOpen: boolean;
  onAuthorize: () => Promise<void>;
  onCancel: () => void;
}

// PodIdentityPrompt
interface PodIdentityPromptProps {
  isOpen: boolean;
  action: "create" | "claim";
  onSetup: () => Promise<void>;
  onCancel: () => void;
}
```

## 🧪 Testing

Each module can be tested independently:

```typescript
// Test signature helpers
import { derivePodSeedFromSignature } from "@/lib/auth/signatures/pod-identity";

test("deterministic POD seed", () => {
  const sig1 = "0x...";
  const sig2 = "0x..."; // same signature
  const seed1 = derivePodSeedFromSignature(sig1);
  const seed2 = derivePodSeedFromSignature(sig2);
  expect(seed1.seed).toBe(seed2.seed); // deterministic!
});

// Test storage encryption
import { encryptJSON, decryptJSON, ensureDeviceKey } from "@/lib/auth/storage/encryption";

test("encrypt/decrypt roundtrip", async () => {
  const key = await ensureDeviceKey();
  const data = { secret: "test" };
  const encrypted = await encryptJSON(key, data);
  const decrypted = await decryptJSON(key, encrypted);
  expect(decrypted).toEqual(data);
});
```

## 📚 Adding New Wallet Providers

1. Create provider implementation in `wallet-providers/`
2. Add to `WalletSelector` component
3. Implement `WalletProvider` interface:
   ```typescript
   export interface WalletProvider {
     type: WalletProviderType;
     name: string;
     isAvailable: () => Promise<boolean>;
     connect: () => Promise<WalletConnection>;
     signMessage: (message: string) => Promise<string>;
     signTypedData: (domain, types, value) => Promise<string>;
   }
   ```
4. Create dedicated auth flow component (like `ParaAuthFlow`)
5. Update main `usePostingIdentity` hook to support new provider

## 🛠️ Future Enhancements

- [ ] WalletConnect support
- [ ] Coinbase Wallet support
- [ ] Hardware wallet support (Ledger, Trezor)
- [ ] Session recovery from seed phrase
- [ ] Multi-device sync via encrypted cloud storage
- [ ] Biometric authentication (WebAuthn)

## 📝 Migration Guide

### From Old (Monolithic) to New (Modular)

**Before:**
```typescript
import { usePostingIdentity } from "@/lib/auth/usePostingIdentity";
// 1100+ lines, hard to understand
```

**After:**
```typescript
// Import only what you need
import { usePostingIdentity } from "@/lib/auth/usePostingIdentity"; // 200 lines
import { PostingAuthPrompt } from "@/lib/auth/components";
import { requestPostingCapability } from "@/lib/auth/flows/request-posting";
```

Benefits:
- ✅ Faster builds (tree-shaking)
- ✅ Better IDE autocomplete
- ✅ Easier debugging
- ✅ Independent testing
- ✅ Clearer architecture

---

**Built with ❤️ for WoCo - Decentralized social platform on Swarm**
