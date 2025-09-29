"use client";

/** Logs out admin and informs ClientProviders via a custom event. */
export function AdminLogoutButton() {
  async function onClick() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Tell ClientProviders to refetch /api/auth/me immediately
    window.dispatchEvent(new Event("admin:changed"));
    // Optional: visual reset — reload if you prefer
    // location.reload();
  }
  return (
    <button onClick={onClick} className="px-3 py-1.5 text-sm rounded border">
      Sign out
    </button>
  );
}
