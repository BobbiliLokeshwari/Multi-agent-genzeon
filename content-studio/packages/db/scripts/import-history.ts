/**
 * One-off import of the Python CLI's memory/posts_history.json, so History,
 * Insights and the writer's memory start with the posts you already have.
 *
 *   npm run db:import-history          (from content-studio/)
 *
 * Safe to re-run: entries already imported (same topic and timestamp) are skipped.
 */
import { readFile } from "node:fs/promises";
import { GenerationSource, GenerationStatus } from "@prisma/client";
import {
  JUDGE_CRITERIA,
  countWords,
  firstLine,
  parseEnv,
  parseScore,
  tokenizeTopic,
  type JudgeData,
  type PostData,
  type ValidationData,
} from "@studio/shared";
import { resolveWorkspacePath } from "@studio/shared/node";
import { z } from "zod";
import { createPrismaClient } from "../src/client";
import { toJson } from "../src/mappers";

const env = parseEnv(
  z.object({
    DATABASE_URL: z.string().min(1),
    LEGACY_HISTORY_FILE: z.string().min(1),
    PROMPT_VERSION: z.string().min(1),
    CONTENT_LOCALE: z.string().min(1),
  }),
  "import-history",
);

/** One entry as linkedin_generator.py's MemoryManager.save writes it. */
const legacyEntrySchema = z.object({
  topic: z.string().trim().min(1),
  tone: z.string().default(""),
  post_type: z.string().default(""),
  post_content: z.string().trim().min(1),
  validation_score: z.unknown().optional(),
  judge_score: z.unknown().optional(),
  prompt_version: z.string().optional(),
  timestamp: z.string().min(1),
});

async function main(): Promise<void> {
  const file = resolveWorkspacePath(env.LEGACY_HISTORY_FILE);
  const parsed = z.array(z.unknown()).parse(JSON.parse(await readFile(file, "utf8")));
  const prisma = createPrismaClient({ url: env.DATABASE_URL });
  const counts = { imported: 0, skipped: 0, invalid: 0 };

  try {
    for (const [index, raw] of parsed.entries()) {
      const result = legacyEntrySchema.safeParse(raw);
      const createdAt = result.success ? new Date(result.data.timestamp) : null;
      if (!result.success || !createdAt || Number.isNaN(createdAt.getTime())) {
        counts.invalid += 1;
        console.warn(`Entry ${index}: skipped, not a valid history entry.`);
        continue;
      }
      const entry = result.data;

      const exists = await prisma.generation.findFirst({
        where: { source: GenerationSource.CLI_IMPORT, topic: entry.topic, createdAt },
        select: { id: true },
      });
      if (exists) {
        counts.skipped += 1;
        continue;
      }

      const validatorScore = parseScore(entry.validation_score);
      const judgeScore = parseScore(entry.judge_score);
      const post: PostData = {
        content: entry.post_content,
        hook: firstLine(entry.post_content),
        wordCount: countWords(entry.post_content, env.CONTENT_LOCALE),
        factsUsed: [],
      };
      // The CLI kept only the overall scores; everything else starts empty.
      const validation: ValidationData = {
        passed: null,
        score: validatorScore,
        accuracyIssues: [],
        qualityIssues: [],
        cringeFlags: [],
        suggestions: [],
        verdict: null,
      };
      const judge: JudgeData = {
        model: null,
        scores: Object.fromEntries(JUDGE_CRITERIA.map((c) => [c, null])) as JudgeData["scores"],
        overall: judgeScore,
        strengths: [],
        weaknesses: [],
        deductions: [],
        verdict: null,
      };

      await prisma.generation.create({
        data: {
          status: GenerationStatus.SUCCEEDED,
          source: GenerationSource.CLI_IMPORT,
          currentStep: "memory",
          attempts: 1,
          topic: entry.topic,
          topicTokens: tokenizeTopic(entry.topic),
          tone: entry.tone,
          postType: entry.post_type,
          promptVersion: entry.prompt_version ?? env.PROMPT_VERSION,
          postContent: post.content,
          hook: post.hook,
          validatorScore,
          judgeScore,
          post: toJson(post),
          validation: toJson(validation),
          judge: toJson(judge),
          createdAt,
          startedAt: createdAt,
          finishedAt: createdAt,
        },
      });
      counts.imported += 1;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `History import from ${file}: ${counts.imported} imported, ${counts.skipped} already present, ${counts.invalid} invalid.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
