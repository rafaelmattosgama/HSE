import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_10px_24px_rgba(6,26,82,0.14)] hover:opacity-95",
        secondary: "border border-slate-300 bg-white/90 text-slate-900 shadow-[0_8px_20px_rgba(5,15,55,0.06)] hover:bg-slate-50",
        destructive: "bg-red-700 text-white hover:bg-red-800",
        ghost: "text-slate-900 hover:bg-slate-100",
      },
      size: {
        default: "h-10 px-4 py-2.5",
        sm: "h-9 px-3.5",
        lg: "h-11 px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
));
Button.displayName = "Button";

export { Button, buttonVariants };
