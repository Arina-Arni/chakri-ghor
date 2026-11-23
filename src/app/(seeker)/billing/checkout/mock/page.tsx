import type { Metadata } from "next";
import { t } from "@/i18n";
import { MockCheckoutScreen } from "../../billing-screens";

export const metadata: Metadata = { title: t("billing.checkoutTitle") };
export const instant = false;

export default function Page() {
  return <MockCheckoutScreen />;
}
