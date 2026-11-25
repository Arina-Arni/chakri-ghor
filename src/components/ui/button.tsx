import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent text-base font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover",
        secondary:
          "border-input/60 bg-surface text-ink shadow-card hover:border-primary hover:bg-primary-soft hover:text-primary-hover",
        outline:
          "border-input/60 bg-surface text-ink hover:bg-muted aria-expanded:bg-muted",
        ghost: "text-ink hover:bg-muted aria-expanded:bg-muted",
        destructive: "bg-danger text-on-solid shadow-card hover:bg-[#991b1b] dark:hover:bg-[#fca5a5]",
        "destructive-soft": "bg-danger-soft text-danger hover:bg-[#fecaca] dark:hover:bg-[rgb(248_113_113/0.25)]",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
        hero: "bg-white text-hero hover:bg-primary-soft dark:hover:bg-[#dbe7f3]",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 gap-1.5 px-3 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 px-6 text-lg",
        icon: "size-11",
        "icon-sm": "size-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner, disables the button and sets aria-busy. */
    loading?: boolean;
  };

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 aria-hidden className="animate-spin" />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants, type ButtonProps };
