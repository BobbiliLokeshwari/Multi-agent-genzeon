import { defineRouting } from "next-intl/routing";

/**
 * Supported UI locales. To add one: add its code here and create
 * messages/<code>.json with the same keys as messages/en.json.
 */
export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  // URLs stay clean (/generate) for the default locale; others get a prefix (/fr/generate).
  localePrefix: "as-needed",
});
