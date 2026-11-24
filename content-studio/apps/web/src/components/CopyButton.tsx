"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { UI } from "@/lib/ui";

export function CopyButton({ text }: { text: string }) {
  const t = useTranslations("common");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), UI.copyFeedbackMs);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <button type="button" className="btn btn-small" onClick={copy} aria-live="polite">
      {state === "copied" ? t("copied") : state === "failed" ? t("copyFailed") : t("copy")}
    </button>
  );
}
