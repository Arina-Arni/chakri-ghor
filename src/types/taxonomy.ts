import type { Id } from "./common";

export type Division = { id: Id; slug: string; nameBn: string; nameEn: string };

export type District = {
  id: Id;
  slug: string;
  divisionId: Id;
  nameBn: string;
  nameEn: string;
  /** Extra spellings matched by the combobox: Banglish, old names, common typos. */
  aliases: string[];
};

export type Category = { id: Id; slug: string; nameBn: string; nameEn: string; icon: string };

export type Tag = { id: Id; slug: string; nameBn: string };

export type OrganizationType =
  | "ministry"
  | "directorate"
  | "district_office"
  | "corporation"
  | "bank"
  | "autonomous"
  | "company"
  | "ngo";

export type Organization = {
  id: Id;
  slug: string;
  nameBn: string;
  nameEn: string;
  /** Initials shown in the avatar, e.g. "DCK". */
  shortName: string;
  type: OrganizationType;
  verified: boolean;
  website: string | null;
  openCircularCount: number;
  totalCircularCount: number;
  version: number;
  updatedAt: string;
};

export type OrganizationSummary = Pick<
  Organization,
  "id" | "slug" | "nameBn" | "nameEn" | "shortName" | "verified" | "type"
>;
