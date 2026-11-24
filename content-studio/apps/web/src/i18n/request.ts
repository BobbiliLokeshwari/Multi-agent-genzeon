import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { getConfig } from "@/lib/config";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // One explicit zone for server and browser, so dates render identically on both.
    timeZone: getConfig().timeZone,
  };
});
