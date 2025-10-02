// app/page.tsx
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import LoginScreen from "@/components/auth/LoginScreen"
import usePostingIdentity from "@/lib/auth/usePostingIdentity"

export default function HomeLogin() {
  const id = usePostingIdentity()
  const router = useRouter()

  // >>> when logged in, send the user to the dashboard
  useEffect(() => {
    if (!id.ready) return
    const loggedIn =
      (id.kind === "web3" && id.postAuth === "parent-bound") ||
      (id.kind === "local" && !!id.safe)
    if (loggedIn) router.replace("/dashboard")
  }, [id.ready, id.kind, id.postAuth, id.safe, router])

  return (
    <main className="mx-auto max-w-xl p-4">
      <LoginScreen />
    </main>
  )
}
