// components/AdminLogoutButton.tsx
"use client";

/**
 * Admin-only sign-out:
 * - Clears the admin flag cookie (dc_admin) via /api/auth/logout.
 * - Keeps the user logged in (woco_subject0x stays).
 * - Notifies ClientProviders so it refetches /api/auth/me.
 */
export function AdminLogoutButton() {
  async function onClick() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include", // IMPORTANT: send cookies so server can clear dc_admin
    });
    // Ask the app to re-check /api/auth/me (will flip isAdmin=false)
    window.dispatchEvent(new Event("admin:changed"));
  }

  return (
    <button onClick={onClick} className="px-3 py-1.5 text-sm rounded border">
      Sign out
    </button>
  );
}

