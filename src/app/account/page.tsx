"use client";

/**
 * Accounts
 * --------
 * Purpose:
 * - Create/import/select a *user* wallet (the "subject").
 * - Persist the ACTIVE private key in localStorage under "woco.active_pk".
 * - Provide safe download actions:
 *     • Download Private Key (.txt)        — raw 0x (sensitive).
 *     • Download Keystore (V3 JSON, UTC)   — password-encrypted (recommended).
 *
 * This page is purely local (no server/Bee calls). Other screens read the active key.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet } from "ethers"; // ethers v6

type Hex0x = `0x${string}`;

type StoredAccount = {
  id: string;      // local id
  label: string;   // friendly name
  pk: Hex0x;       // private key (0x-prefixed)
  address: Hex0x;  // derived 0x address (subject)
};

const ACCOUNTS_KEY = "woco.accounts";
const ACTIVE_PK_KEY = "woco.active_pk";

/* ------------------------- localStorage helpers ------------------------- */

function loadAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as StoredAccount[]) : [];
  } catch {
    return [];
  }
}
function saveAccounts(list: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

/* ----------------------------- file helpers ----------------------------- */

/** Trigger a client-side download of given text content. */
function downloadTextFile(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Build a UTC-style filename used by common keystore exporters. */
function utcFilenameFor(address0x: string, d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const MM = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  const iso = `${yyyy}-${MM}-${dd}T${hh}-${mm}-${ss}.000Z`;
  const addrNo0x = address0x.slice(2).toLowerCase();
  return `UTC--${iso}--${addrNo0x}.json`;
}

/* --------------------------------- UI ---------------------------------- */

export default function Page() {
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activePk, setActivePk] = useState<Hex0x | null>(null);
  const [label, setLabel] = useState("");

  // Load saved accounts + current active pk (if any)
  useEffect(() => {
    const list = loadAccounts();
    setAccounts(list);

    const pk = (localStorage.getItem(ACTIVE_PK_KEY) ||
      localStorage.getItem("demo_user_pk")) as Hex0x | null; // legacy fallback
    if (pk) setActivePk(pk);
  }, []);

  /** Set the active account for the app (subject used elsewhere) */
  function setActive(pk: Hex0x) {
    localStorage.setItem(ACTIVE_PK_KEY, pk);
    setActivePk(pk);
  }

  /** Generate a brand-new wallet and make it active */
  function generateNew() {
    const w = Wallet.createRandom();
    const entry: StoredAccount = {
      id: String(Date.now()),
      label: label || `Account ${accounts.length + 1}`,
      pk: w.privateKey as Hex0x,
      address: w.address as Hex0x,
    };
    const next = [...accounts, entry];
    setAccounts(next);
    saveAccounts(next);
    setLabel("");
    setActive(entry.pk);
  }

  /** Import a private key (0x… or raw hex) and make it active */
  function importPk(raw: string) {
    let pk = raw.trim();
    if (!pk) return;
    if (!pk.startsWith("0x")) pk = `0x${pk}`;
    try {
      const w = new Wallet(pk as Hex0x);
      const entry: StoredAccount = {
        id: String(Date.now()),
        label: label || `Imported ${w.address.slice(0, 10)}…`,
        pk: pk as Hex0x,
        address: w.address as Hex0x,
      };
      const next = [...accounts, entry];
      setAccounts(next);
      saveAccounts(next);
      setLabel("");
      setActive(entry.pk);
    } catch (e) {
      alert(`Invalid private key: ${String(e)}`);
    }
  }

  /** Delete from list (clears active if you deleted the active one) */
  function remove(id: string) {
    const next = accounts.filter((a) => a.id !== id);
    setAccounts(next);
    saveAccounts(next);
    if (activePk && !next.some((a) => a.pk === activePk)) {
      localStorage.removeItem(ACTIVE_PK_KEY);
      setActivePk(null);
    }
  }

  /** Download raw private key text with prominent warnings. */
  function downloadPkTxt(a: StoredAccount) {
    const contents =
`# WARNING: PRIVATE KEY (UNENCRYPTED)
# Anyone with this key can control your funds and identity.
# Store offline and never share. Consider using the encrypted keystore instead.

Address: ${a.address}
PrivateKey: ${a.pk}
`;
    const filename = `devconnect-account-${a.address.slice(2, 10)}.txt`;
    downloadTextFile(filename, contents, "text/plain");
  }

  /** Download password-encrypted V3 keystore JSON (recommended). */
  async function downloadKeystore(a: StoredAccount) {
    const password = prompt(
      "Enter a password for the keystore JSON (min 1 character). DO NOT FORGET THIS PASSWORD."
    );
    if (password == null) return; // cancelled
    if (password.length < 1) {
      alert("Password too short.");
      return;
    }
    try {
      const w = new Wallet(a.pk);
      // ethers v6: AES-128-CTR + scrypt by default
      const json = await w.encrypt(password);
      const filename = utcFilenameFor(a.address);
      downloadTextFile(filename, json, "application/json");
    } catch (e) {
      alert(`Failed to create keystore: ${String(e)}`);
    }
  }

  return (
    <main className="min-h-dvh bg-neutral-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <span className="font-semibold">Accounts</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm underline">Home</Link>
            <Link href="/profile" className="text-sm underline">Edit profile</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-4 space-y-6">
        {/* Create / Import */}
        <section className="rounded-xl bg-white border shadow-sm p-4 space-y-2">
          <div className="text-sm font-semibold">Create / Import account</div>
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        <div className="flex gap-2">
            <button
              className="px-3 py-1.5 text-sm rounded border bg-black text-white"
              onClick={generateNew}
              type="button"
            >
              Generate new
            </button>
            <button
              className="px-3 py-1.5 text-sm rounded border bg-white"
              onClick={() => {
                const raw = prompt("Paste private key (0x… or hex):") || "";
                importPk(raw);
              }}
              type="button"
            >
              Import private key
            </button>
          </div>
          <p className="text-xs text-amber-700">
            Tip: after creating/importing, use the buttons in the table to set the active account and download backups.
          </p>
        </section>

        {/* Saved accounts */}
        <section className="rounded-xl bg-white border shadow-sm p-4">
          <div className="text-sm font-semibold mb-2">Saved accounts</div>
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.id} className="border rounded p-2 text-xs bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div><span className="font-medium">{a.label}</span></div>
                    <div>Address:&nbsp;<code className="break-all">{a.address}</code></div>
                    <div>Private key:&nbsp;<code className="break-all">{a.pk}</code></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="px-2 py-1 rounded border bg-white" onClick={() => setActive(a.pk)}>
                      {activePk === a.pk ? "Active ✓" : "Set active"}
                    </button>
                    <button className="px-2 py-1 rounded border bg-white" onClick={() => downloadPkTxt(a)}>
                      Download PK (.txt)
                    </button>
                    <button className="px-2 py-1 rounded border bg-white" onClick={() => downloadKeystore(a)}>
                      Download keystore (JSON)
                    </button>
                    <button className="px-2 py-1 rounded border bg-white" onClick={() => remove(a.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!accounts.length && <div className="text-xs text-gray-500">No accounts yet.</div>}
          </div>
          <div className="text-xs text-gray-600 mt-2">
            Active private key:&nbsp;<code>{activePk ?? "(none)"}</code>
          </div>
        </section>

        {/* Security reminder */}
        <p className="text-xs text-gray-500">
          Security: keep your private key/keystore offline and backed up. Anyone with access can control this account.
        </p>
      </div>
    </main>
  );
}
