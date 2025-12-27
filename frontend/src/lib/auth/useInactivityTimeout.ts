// src/lib/auth/useInactivityTimeout.ts
"use client"

/**
 * useInactivityTimeout
 *
 * Tracks user activity (mouse, keyboard, touch) and triggers a callback
 * after a period of inactivity. Designed for auto-logout of Web3 users.
 *
 * @param onTimeout - Callback to execute when timeout expires
 * @param timeoutMs - Inactivity period in milliseconds (default: 30 minutes)
 * @param enabled - Whether the timeout is active (e.g., only for Web3 users)
 */

import { useEffect, useRef } from "react"

const DEFAULT_TIMEOUT = 30 * 60 * 1000 // 30 minutes

// Detect if on mobile device
function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
}

export function useInactivityTimeout(
  onTimeout: () => void,
  timeoutMs: number = DEFAULT_TIMEOUT,
  enabled: boolean = true
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const onTimeoutRef = useRef(onTimeout)

  // Keep callback ref up to date
  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  useEffect(() => {
    // Don't activate on mobile devices or if disabled
    if (!enabled || isMobileDevice()) {
      return
    }

    // Reset the timeout
    const resetTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        onTimeoutRef.current()
      }, timeoutMs)
    }

    // Activity events to monitor
    const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"]

    // Start the initial timeout
    resetTimeout()

    // Add event listeners
    events.forEach((event) => {
      window.addEventListener(event, resetTimeout, { passive: true })
    })

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetTimeout)
      })
    }
  }, [timeoutMs, enabled])
}
