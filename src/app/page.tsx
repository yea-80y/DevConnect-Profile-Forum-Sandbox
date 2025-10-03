// app/page.tsx
"use client"

import LoginScreen from "@/components/auth/LoginScreen"

export default function HomeLogin() {
  return (
    <main className="mx-auto max-w-xl p-4">
      <LoginScreen />
    </main>
  )
}
