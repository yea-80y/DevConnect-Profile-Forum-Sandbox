// components/ui/button.tsx
import * as React from "react";

/**
 * Button variants:
 * - "default"   => black background, white text (your current look)
 * - "secondary" => white background with border (used on Login screen)
 *
 * Usage:
 *   <Button>Primary</Button>
 *   <Button variant="secondary">Secondary</Button>
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    // Base styles (kept close to your original)
    const base =
      "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50";

    // Variant-specific styles
    const look =
      variant === "secondary"
        ? "border bg-white hover:bg-gray-50 text-black"
        : "bg-black text-white hover:bg-black/90";

    // Minimal class merge without a helper
    const classes = [base, look, className].filter(Boolean).join(" ");

    return (
      <button
        ref={ref}
        suppressHydrationWarning
        className={classes}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
