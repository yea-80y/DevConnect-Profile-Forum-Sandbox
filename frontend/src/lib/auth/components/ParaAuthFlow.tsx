"use client";

/**
 * Para Wallet Authentication Flow
 * Email + OTP → Creates crypto account
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ParaAuthFlowProps {
  isOpen: boolean;
  onComplete: (address: string) => void;
  onCancel: () => void;
}

type Step = "email" | "otp" | "creating";

export function ParaAuthFlow({
  isOpen,
  onComplete,
  onCancel,
}: ParaAuthFlowProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendOTP = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // TODO: Call Para wallet API to send OTP
      // const response = await paraWallet.sendOTP(email);

      // Simulate API call for now
      await new Promise(resolve => setTimeout(resolve, 1000));

      setStep("otp");
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setStep("creating");

      // TODO: Call Para wallet API to verify OTP and create account
      // const { address, privateKey } = await paraWallet.verifyOTPAndCreateAccount(email, otp);

      // Simulate account creation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // TODO: Store encrypted private key
      const mockAddress = "0x" + Array(40).fill(0).map(() =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");

      onComplete(mockAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
      setIsLoading(false);
      setStep("otp");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {step === "email" && "Create Your Account"}
            {step === "otp" && "Enter Verification Code"}
            {step === "creating" && "Creating Your Wallet..."}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {step === "email" && "We'll send you a one-time code to verify your email"}
            {step === "otp" && `Code sent to ${email}`}
            {step === "creating" && "Generating your secure crypto wallet"}
          </p>
        </div>

        {/* Email Step */}
        {step === "email" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
                autoFocus
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button onClick={onCancel} variant="secondary" className="flex-1" disabled={isLoading}>
                Cancel
              </Button>
              <Button
                onClick={handleSendOTP}
                className="flex-1"
                disabled={!email || isLoading}
              >
                {isLoading ? "Sending..." : "Continue"}
              </Button>
            </div>
          </div>
        )}

        {/* OTP Step */}
        {step === "otp" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Verification Code
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-center text-2xl tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
                autoFocus
                maxLength={6}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleSendOTP}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              disabled={isLoading}
            >
              Didn't receive code? Resend
            </button>

            <div className="flex gap-3 pt-4">
              <Button onClick={() => setStep("email")} variant="secondary" className="flex-1" disabled={isLoading}>
                Back
              </Button>
              <Button
                onClick={handleVerifyOTP}
                className="flex-1"
                disabled={otp.length !== 6 || isLoading}
              >
                {isLoading ? "Verifying..." : "Verify"}
              </Button>
            </div>
          </div>
        )}

        {/* Creating Step */}
        {step === "creating" && (
          <div className="py-8 text-center">
            <div className="flex justify-center mb-4">
              <svg className="animate-spin h-12 w-12 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Generating your secure wallet...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
