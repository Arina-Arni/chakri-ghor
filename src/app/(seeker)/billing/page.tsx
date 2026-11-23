import type { Metadata } from "next";
import { t } from "@/i18n";
import { BillingScreen } from "./billing-screens";

export const metadata: Metadata = { title: t("billing.title") };
export const instant = false;

export default function Page() {
  return <BillingScreen />;
}
