import { z } from "zod";
import { t } from "@/i18n";
import { intInput } from "./common";

export const roleChangeSchema = z.object({
  role: z.enum(["seeker", "moderator", "admin"]),
  adminPassword: z.string().min(1, { error: t("validation.required") }),
});

export const planQuotaSchema = z.object({
  freeAiSearch: intInput(0, 1000),
  freeTailor: intInput(0, 1000),
  freeCvParse: intInput(0, 1000),
  premiumAiSearch: intInput(0, 10000),
  premiumTailor: intInput(0, 10000),
  premiumCvParse: intInput(0, 10000),
  premiumPriceBdt: intInput(0, 10000),
});

export const jsonFixSchema = z.object({
  json: z.string().refine(
    (s) => {
      try {
        JSON.parse(s);
        return true;
      } catch {
        return false;
      }
    },
    { error: t("admin.workflow.fixInvalid") },
  ),
});
