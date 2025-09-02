// src/app/profile/page.tsx
import ProfileTab from "./ProfileTab";
import Link from "next/link";

export default function ProfilePage() {
  return (
    <main className="p-4">
      <div className="mb-3">
        <Link href="/" className="inline-flex items-center px-3 py-1.5 text-sm rounded border bg-white">
          ← Home
        </Link>
      </div>

      <ProfileTab />
    </main>
  );
}