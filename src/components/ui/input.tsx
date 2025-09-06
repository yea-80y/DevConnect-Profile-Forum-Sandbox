import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      suppressHydrationWarning
      className={`w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 ${className ?? ""}`}
      {...props}
    />
  )
);
Input.displayName = "Input";
