import {
  apiPaths,
  joinUrl,
  type GenerationSummary,
  type PostType,
  type Tone,
} from "@studio/shared";
import { requestJson } from "./http";

export interface NewGeneration {
  topic: string;
  tone: Tone;
  postType: PostType;
  promptVersion?: string;
}

export function createGeneration(apiUrl: string, body: NewGeneration): Promise<GenerationSummary> {
  return requestJson<GenerationSummary>(apiUrl, apiPaths.generations(), { method: "POST", body });
}

export function generationEventsUrl(apiUrl: string, id: string): string {
  return joinUrl(apiUrl, apiPaths.generationEvents(id));
}
