import * as React from "react";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      suppressHydrationWarning
      className={`inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50 ${className ?? ""}`}
      {...props}
    />
  )
);
Button.displayName = "Button";
