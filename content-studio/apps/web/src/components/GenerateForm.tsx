"use client";

import { API_UNREACHABLE, type Catalog, type ClientErrorCode, type PostType, type Tone } from "@studio/shared";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { createGeneration } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/http";
import { useLabels } from "@/lib/labels";

interface FormError {
  code: ClientErrorCode;
  topicInvalid: boolean;
}

export function GenerateForm({ catalog, apiUrl }: { catalog: Catalog; apiUrl: string }) {
  const t = useTranslations("generate");
  const tErrors = useTranslations("errors");
  const labels = useLabels();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<FormError | null>(null);
  const max = catalog.limits.topicMaxLength;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const promptVersion = String(form.get("promptVersion") ?? "");
    setError(null);
    startTransition(async () => {
      try {
        const created = await createGeneration(apiUrl, {
          topic: String(form.get("topic") ?? ""),
          tone: form.get("tone") as Tone,
          postType: form.get("postType") as PostType,
          ...(promptVersion ? { promptVersion } : {}),
        });
        router.push({ pathname: "/generate", query: { run: created.id } });
      } catch (caught) {
        const apiError = caught instanceof ApiError ? caught : null;
        setError({
          code: apiError?.code ?? API_UNREACHABLE,
          topicInvalid: apiError?.details.some((issue) => issue.path === "topic") ?? false,
        });
      }
    });
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="topic">{t("topic")}</label>
        <textarea
          id="topic"
          name="topic"
          required
          rows={3}
          maxLength={max}
          placeholder={t("topicPlaceholder")}
          aria-describedby="topic-hint"
          aria-invalid={error?.topicInvalid || undefined}
        />
        <p id="topic-hint" className={error?.topicInvalid ? "hint hint-error" : "hint"}>
          {error?.topicInvalid ? tErrors("topicField", { max }) : t("topicHint", { max })}
        </p>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="tone">{t("tone")}</label>
          <select id="tone" name="tone" defaultValue={catalog.defaults.tone}>
            {catalog.tones.map((tone) => (
              <option key={tone} value={tone}>
                {labels.tone(tone)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="postType">{t("postType")}</label>
          <select id="postType" name="postType" defaultValue={catalog.defaults.postType}>
            {catalog.postTypes.map((postType) => (
              <option key={postType} value={postType}>
                {labels.postType(postType)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {catalog.promptVersions.length > 1 && (
        <div className="field">
          <label htmlFor="promptVersion">{t("promptVersion")}</label>
          <select id="promptVersion" name="promptVersion" defaultValue={catalog.defaults.promptVersion}>
            {catalog.promptVersions.map((version) => (
              <option key={version} value={version}>
                {version === catalog.defaults.promptVersion ? t("defaultVersion", { version }) : version}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="notice notice-error" role="alert">
          {tErrors(error.code)}
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
