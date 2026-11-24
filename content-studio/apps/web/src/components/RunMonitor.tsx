"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { deriveStepStates } from "@/lib/steps";
import { useGenerationStream } from "@/lib/use-generation-stream";
import { GenerationResult } from "./GenerationResult";
import { StatusBadge } from "./StatusBadge";
import { StepTimeline } from "./StepTimeline";

export function RunMonitor({ eventsUrl }: { eventsUrl: string }) {
  const t = useTranslations("run");
  const tSteps = useTranslations("steps");
  const router = useRouter();
  const { generation, connection } = useGenerationStream(eventsUrl);

  // When the run finishes, refresh server components (e.g. the recent-runs list).
  useEffect(() => {
    if (connection === "ended") router.refresh();
  }, [connection, router]);

  if (!generation) {
    const unavailable = connection === "unavailable";
    return (
      <div className="card">
        <p className={unavailable ? "notice notice-error" : "muted"} role={unavailable ? "alert" : "status"}>
          {unavailable ? t("unavailable") : t("connecting")}
        </p>
      </div>
    );
  }

  const notice =
    connection === "reconnecting"
      ? t("reconnecting")
      : connection === "closed"
        ? t("closed")
        : generation.status === "QUEUED"
          ? t("queued")
          : null;
  const step = generation.currentStep;
  const announcement = step
    ? tSteps("announcement", { step: tSteps(`${step}.name`), state: tSteps(`state.${deriveStepStates(generation)[step]}`) })
    : "";

  return (
    <article className="card stack" aria-labelledby="run-title">
      <header className="run-head">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2 id="run-title">{generation.topic}</h2>
        </div>
        <StatusBadge status={generation.status} />
      </header>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      <StepTimeline generation={generation} />
      <GenerationResult generation={generation} />
      <p>
        <Link href={`/history/${generation.id}`}>{t("openDetails")}</Link>
      </p>
    </article>
  );
}
