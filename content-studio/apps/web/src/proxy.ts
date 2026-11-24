import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** Picks the locale (URL prefix, cookie, then Accept-Language) and redirects bare paths to it. */
export default createMiddleware(routing);

export const config = {
  // Everything except Next internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
