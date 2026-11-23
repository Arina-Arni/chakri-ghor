"use client";

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Toasts (aria-live via sonner). Light theme only until dark mode lands (P2). */
const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="light"
    position="bottom-center"
    offset={{ bottom: 88 }}
    mobileOffset={{ bottom: 88 }}
    containerAriaLabel="নোটিফিকেশন বার্তা"
    icons={{
      success: <CircleCheckIcon className="size-5 text-success" />,
      info: <InfoIcon className="size-5 text-info" />,
      warning: <TriangleAlertIcon className="size-5 text-warning" />,
      error: <OctagonXIcon className="size-5 text-danger" />,
      loading: <Loader2Icon className="size-5 animate-spin" />,
    }}
    toastOptions={{ classNames: { toast: "!text-base !rounded-xl", description: "!text-muted-foreground" } }}
    style={
      {
        "--normal-bg": "var(--surface)",
        "--normal-text": "var(--ink)",
        "--normal-border": "var(--line)",
        "--border-radius": "12px",
      } as React.CSSProperties
    }
    {...props}
  />
);

export { Toaster };
