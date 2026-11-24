import { POST_TYPES, TONES, isOneOf } from "@studio/shared";
import { useTranslations } from "next-intl";

/**
 * Translated labels for catalog values. Runs imported from the CLI may carry
 * free-text tones, which are shown as typed.
 */
export function useLabels() {
  const t = useTranslations();
  return {
    tone: (value: string) => (isOneOf(TONES, value) ? t(`tones.${value}`) : value || t("common.notAvailable")),
    postType: (value: string) =>
      isOneOf(POST_TYPES, value) ? t(`postTypes.${value}`) : value || t("common.notAvailable"),
  };
}
