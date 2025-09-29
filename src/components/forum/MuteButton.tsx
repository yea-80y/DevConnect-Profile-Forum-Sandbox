"use client";
import { useMe } from "@/app/ClientProviders";

type Kind = "thread" | "reply";

export function MuteButton({
  boardId,
  refHex,
  kind,
  onMuted,
}: {
  boardId: string;
  refHex: string;          // 64-hex (with or without 0x)
  kind: Kind;              // "thread" for board roots, "reply" for replies
  onMuted?: () => void;    // optional: optimistic UI removal
}) {
  const { isAdmin } = useMe();
  if (!isAdmin) return null;

    async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    onMuted?.(); // optimistic (optional)
    const res = await fetch("/api/moderation/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, ref: refHex, kind }),
    });
    if (!res.ok) {
        alert("Mute failed");
    }
    }

  return (
    <button
      onClick={onClick}
      className="text-xs opacity-70 hover:opacity-100 underline underline-offset-2"
      title="Hide this post for everyone (admin)"
    >
      Mute
    </button>
  );
}
