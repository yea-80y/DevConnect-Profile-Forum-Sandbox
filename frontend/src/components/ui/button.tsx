// components/ui/button.tsx
import * as React from "react";

/**
 * <Button />
 * -------------
 * - Small wrapper over a native <button> with two visual variants.
 * - **Important**: defaults `type="button"` so clicks do NOT submit a parent <form>.
 *   HTML buttons default to `type="submit"`, which can trigger a form submit (page reload / navigation)
 *   after your onClick runs — this is a common source of double-actions (e.g., double sign prompts).
 *
 * Usage:
 *   <Button>Primary</Button>
 *   <Button variant="secondary">Secondary</Button>
 *   <Button type="submit">Submit</Button> // only when you explicitly want form submission
 */

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style: "default" (black) or "secondary" (white w/ border). */
  variant?: "default" | "secondary";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", type, ...props }, ref) => {
    // Base shape/spacing/behavior (kept minimal and framework-agnostic)
    const base =
      "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50";

    // Variant look:
    // - default: dark solid button
    // - secondary: light button with border
    const look =
      variant === "secondary"
        ? "border bg-white hover:bg-gray-50 text-black"
        : "bg-black text-white hover:bg-black/90";

    // Merge optional external classes last so callers can extend/override.
    const classes = [base, look, className].filter(Boolean).join(" ");

    return (
      <button
        ref={ref}
        /**
         * Default to "button" to prevent unintended form submissions.
         * If a consumer *wants* submit behavior, they can pass type="submit".
         */
        type={type ?? "button"}
        className={classes}
        /**
         * Note: `suppressHydrationWarning` is generally not needed here.
         * If you were previously seeing hydration mismatch warnings,
         * consider removing this prop and fixing the underlying mismatch.
         * You can uncomment the next line if you intentionally want to suppress.
         */
        // suppressHydrationWarning
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
