import "server-only";
import {
  apiPaths,
  type Catalog,
  type GenerationDetail,
  type GenerationSummary,
  type Insights,
  type Page,
  type PromptVersionDetail,
  type PromptVersionSummary,
} from "@studio/shared";
import { cache } from "react";
import { getConfig } from "../config";
import { requestJson, type RequestOptions } from "./http";

function get<T>(path: string, query?: RequestOptions["query"]): Promise<T> {
  // Live data: never cached by Next.js.
  return requestJson<T>(getConfig().internalApiUrl, path, { cache: "no-store", ...(query ? { query } : {}) });
}

export interface GenerationFilters {
  status?: string;
  tone?: string;
  postType?: string;
  q?: string;
  cursor?: string;
  limit: number;
}

// React's cache() de-duplicates identical calls within one request
// (for example generateMetadata and the page both loading the same run).
export const serverApi = {
  catalog: cache(() => get<Catalog>(apiPaths.catalog())),
  generations: (filters: GenerationFilters) =>
    get<Page<GenerationSummary>>(apiPaths.generations(), { ...filters }),
  generation: cache((id: string) => get<GenerationDetail>(apiPaths.generation(id))),
  insights: cache(() => get<Insights>(apiPaths.insights(), { tz: getConfig().timeZone })),
  prompts: cache(() => get<PromptVersionSummary[]>(apiPaths.prompts())),
  promptVersion: cache((version: string) => get<PromptVersionDetail>(apiPaths.promptVersion(version))),
};
