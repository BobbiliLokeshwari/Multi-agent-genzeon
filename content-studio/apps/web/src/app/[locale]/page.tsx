import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

export default async function Home() {
  redirect({ href: "/generate", locale: await getLocale() });
}
