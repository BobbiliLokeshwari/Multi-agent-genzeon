import { tavily } from "@tavily/core";
import { describeError } from "./errors";

export const SEARCH_DEPTHS = ["basic", "advanced", "fast", "ultra-fast"] as const;
export type SearchDepth = (typeof SEARCH_DEPTHS)[number];

export interface SearchSource {
  title: string;
  url: string;
  content: string;
}

export interface SearchOutcome {
  query: string;
  sources: SearchSource[];
  /** Set when this query failed; the others still count. */
  error: string | null;
}

export interface Researcher {
  searchAll(queries: readonly string[]): Promise<SearchOutcome[]>;
}

export interface TavilyResearcherOptions {
  apiKey: string;
  searchDepth: SearchDepth;
  maxResults: number;
  timeoutMs: number;
}

export function createTavilyResearcher(options: TavilyResearcherOptions): Researcher {
  const client = tavily({ apiKey: options.apiKey });
  // The SDK takes its timeout in seconds; configuration is in milliseconds everywhere.
  const timeoutSeconds = Math.max(1, Math.ceil(options.timeoutMs / 1000));

  return {
    async searchAll(queries) {
      // The Python version searched one query at a time and threw away every
      // result if any single query failed. The queries are independent, so run
      // them together and keep whatever succeeded.
      const settled = await Promise.allSettled(
        queries.map((query) =>
          client.search(query, {
            searchDepth: options.searchDepth,
            maxResults: options.maxResults,
            timeout: timeoutSeconds,
          }),
        ),
      );
      return settled.map((result, index): SearchOutcome => {
        const query = queries[index] ?? "";
        if (result.status === "rejected") {
          return { query, sources: [], error: describeError(result.reason) };
        }
        return {
          query,
          sources: result.value.results.map((item) => ({
            title: item.title ?? "",
            url: item.url ?? "",
            content: item.content ?? "",
          })),
          error: null,
        };
      });
    },
  };
}
