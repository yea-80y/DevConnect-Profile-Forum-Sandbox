"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProfileView from "./profile/ProfileView";

type ApiOk = { ok: true; owner: `0x${string}`; user?: `0x${string}` };
type ApiErr = { ok: false; error: string };

export default function Home() {
  const [owner, setOwner] = useState<`0x${string}` | null>(null);
  const [viewerOwner, setViewerOwner] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d: ApiOk | ApiErr) => {
        if ("ok" in d && d.ok && d.owner) {
          console.log("[profile] /api/profile owner:", d.owner, "user:", (d as ApiOk).user);
          setOwner(d.owner);
          // Prefer generated user address if available; fall back to platform owner
          setViewerOwner((d as ApiOk).user ?? d.owner);
        } else {
          setError((d as ApiErr).error || "No owner returned");
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="min-h-dvh bg-neutral-50 pb-20">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <span className="font-semibold">Devconnect</span>
          <Link href="/profile" className="text-sm underline">Edit profile</Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-4 space-y-6">
        <section className="rounded-xl bg-white border shadow-sm p-4">
          <div className="mb-3 text-sm font-semibold">My Profile</div>
          {viewerOwner ? (
            <ProfileView owner={viewerOwner} />
          ) : (
            <div className="text-sm text-gray-500">
              {error ?? "Loading profile…"}
            </div>
          )}
          {/* Small print: show which address we're using */}
          {owner && (
            <p className="mt-2 text-xs text-gray-500 break-all">
              Viewing profile for: <code>{viewerOwner}</code>
              {viewerOwner !== owner && (
                <> (generated account; platform signer is <code>{owner}</code>)</>
              )}
            </p>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Link href="/programme" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Programme</div>
            <div className="text-xs text-gray-500">Browse sessions & schedule</div>
          </Link>
          <Link href="/map" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Map</div>
            <div className="text-xs text-gray-500">Find venues & rooms</div>
          </Link>
          <Link href="/quests" className="rounded-xl bg-white border shadow-sm p-4">
            <div className="text-sm font-medium">Quests</div>
            <div className="text-xs text-gray-500">Play & earn rewards</div>
          </Link>
          <Link href="/profile" className="rounded-xl bg-white border shadow_sm p-4">
            <div className="text-sm font-medium">Settings</div>
            <div className="text-xs text-gray-500">Update your profile</div>
          </Link>
        </section>
      </div>
    </main>
  );
}
