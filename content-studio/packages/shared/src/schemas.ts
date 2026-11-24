/**
 * Request validation. Limits come from each app's configuration, so the
 * schemas are built by factories instead of baking numbers in.
 */
import { z } from "zod";
import {
  DEFAULT_POST_TYPE,
  DEFAULT_TONE,
  GENERATION_STATUSES,
  POST_TYPES,
  PROMPT_VERSION_PATTERN,
  TONES,
} from "./catalog";
import { isValidTimeZone } from "./text";

/** HTML GET forms send `?status=` for "All"; treat empty strings as absent. */
function optionalParam<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

export const generationIdSchema = z.uuid();
export const generationParamsSchema = z.object({ id: generationIdSchema });

export const promptVersionSchema = z.string().regex(PROMPT_VERSION_PATTERN);
export const promptVersionParamsSchema = z.object({ version: promptVersionSchema });

export interface RequestLimits {
  topicMaxLength: number;
  searchMaxLength: number;
  pageSizeDefault: number;
  pageSizeMax: number;
}

export function createGenerationBodySchema(limits: Pick<RequestLimits, "topicMaxLength">) {
  return z.object({
    topic: z.string().trim().min(1).max(limits.topicMaxLength),
    tone: z.enum(TONES).default(DEFAULT_TONE),
    postType: z.enum(POST_TYPES).default(DEFAULT_POST_TYPE),
    promptVersion: optionalParam(promptVersionSchema),
  });
}
export type CreateGenerationBody = z.output<ReturnType<typeof createGenerationBodySchema>>;

export function createListGenerationsQuerySchema(limits: RequestLimits) {
  return z.object({
    status: optionalParam(z.enum(GENERATION_STATUSES)),
    tone: optionalParam(z.enum(TONES)),
    postType: optionalParam(z.enum(POST_TYPES)),
    q: optionalParam(z.string().trim().min(1).max(limits.searchMaxLength)),
    cursor: optionalParam(generationIdSchema),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(limits.pageSizeMax)
      .default(limits.pageSizeDefault),
  });
}
export type ListGenerationsQuery = z.output<ReturnType<typeof createListGenerationsQuerySchema>>;

export const insightsQuerySchema = z.object({
  tz: optionalParam(z.string().refine(isValidTimeZone, { message: "Unknown IANA time zone" })),
});
