import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  PROMPT_VERSION_PATTERN,
  listPlaceholders,
  type PromptFile,
  type PromptFileKind,
  type PromptFileSummary,
} from "@studio/shared";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { PromptFileError, PromptVersionNotFoundError, describeError } from "../errors";
import {
  agentProfileSchema,
  pipelineTemplatesSchema,
  type AgentProfile,
  type PipelineTemplates,
} from "./schema";

/** File names inside prompts/<version>/. The Python CLI uses the same names. */
export const PROMPT_FILES = {
  agents: {
    research: "research_agent.yaml",
    writer: "writer_agent.yaml",
    validator: "validator_agent.yaml",
  },
  tasks: {
    research: "research_task.md",
    writing: "writing_task.md",
    validation: "validation_task.md",
  },
  judge: "judge_prompt.md",
  pipeline: "pipeline.yaml",
} as const;

const KIND_BY_SUFFIX: ReadonlyArray<readonly [suffix: string, kind: PromptFileKind]> = [
  ["_agent.yaml", "agent"],
  ["_task.md", "task"],
  ["_prompt.md", "prompt"],
];
const PROMPT_EXTENSIONS = new Set([".md", ".yaml", ".yml"]);
const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function kindOf(fileName: string): PromptFileKind {
  return KIND_BY_SUFFIX.find(([suffix]) => fileName.endsWith(suffix))?.[1] ?? "config";
}

export interface PromptBundle {
  version: string;
  agents: Record<keyof typeof PROMPT_FILES.agents, AgentProfile>;
  tasks: Record<keyof typeof PROMPT_FILES.tasks, string>;
  judge: string;
  pipeline: PipelineTemplates;
}

/**
 * Reads and validates prompts/<version>/. With caching on, each version is
 * parsed once per process (the Python version re-read files on every node);
 * concurrent first loads share one in-flight promise.
 */
export class PromptStore {
  readonly #root: string;
  readonly #cache: Map<string, Promise<PromptBundle>> | null;

  constructor(rootDir: string, options: { cache: boolean }) {
    this.#root = path.resolve(rootDir);
    this.#cache = options.cache ? new Map() : null;
  }

  get rootDir(): string {
    return this.#root;
  }

  async listVersions(): Promise<string[]> {
    const entries = await readdir(this.#root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && PROMPT_VERSION_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort(naturalOrder.compare);
  }

  async hasVersion(version: string): Promise<boolean> {
    if (!PROMPT_VERSION_PATTERN.test(version)) return false;
    try {
      return (await stat(this.#dir(version))).isDirectory();
    } catch {
      return false;
    }
  }

  load(version: string): Promise<PromptBundle> {
    const cached = this.#cache?.get(version);
    if (cached) return cached;
    const pending = this.#loadUncached(version);
    if (this.#cache) {
      this.#cache.set(version, pending);
      pending.catch(() => this.#cache?.delete(version));
    }
    return pending;
  }

  async listFiles(version: string): Promise<PromptFileSummary[]> {
    await this.#assertVersion(version);
    const dir = this.#dir(version);
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && PROMPT_EXTENSIONS.has(path.extname(entry.name)))
        .map(async (entry) => ({
          name: entry.name,
          kind: kindOf(entry.name),
          bytes: (await stat(path.join(dir, entry.name))).size,
        })),
    );
    return files.sort((a, b) => naturalOrder.compare(a.name, b.name));
  }

  async readFiles(version: string): Promise<PromptFile[]> {
    const summaries = await this.listFiles(version);
    return Promise.all(
      summaries.map(async (summary) => {
        const content = await this.#read(version, summary.name);
        return { ...summary, content, placeholders: listPlaceholders(content) };
      }),
    );
  }

  async #loadUncached(version: string): Promise<PromptBundle> {
    await this.#assertVersion(version);
    const { agents, tasks } = PROMPT_FILES;
    const [research, writer, validator, researchTask, writingTask, validationTask, judge, pipeline] =
      await Promise.all([
        this.#yaml(version, agents.research, agentProfileSchema),
        this.#yaml(version, agents.writer, agentProfileSchema),
        this.#yaml(version, agents.validator, agentProfileSchema),
        this.#read(version, tasks.research),
        this.#read(version, tasks.writing),
        this.#read(version, tasks.validation),
        this.#read(version, PROMPT_FILES.judge),
        this.#yaml(version, PROMPT_FILES.pipeline, pipelineTemplatesSchema),
      ]);
    return {
      version,
      agents: { research, writer, validator },
      tasks: { research: researchTask, writing: writingTask, validation: validationTask },
      judge,
      pipeline,
    };
  }

  #dir(version: string): string {
    return path.join(this.#root, version);
  }

  async #assertVersion(version: string): Promise<void> {
    if (!(await this.hasVersion(version))) throw new PromptVersionNotFoundError(version);
  }

  async #read(version: string, file: string): Promise<string> {
    try {
      return await readFile(path.join(this.#dir(version), file), "utf8");
    } catch (error) {
      throw new PromptFileError(version, file, describeError(error));
    }
  }

  async #yaml<T extends z.ZodType>(version: string, file: string, schema: T): Promise<z.output<T>> {
    let raw: unknown;
    try {
      raw = parseYaml(await this.#read(version, file));
    } catch (error) {
      if (error instanceof PromptFileError) throw error;
      throw new PromptFileError(version, file, describeError(error));
    }
    const result = schema.safeParse(raw);
    if (!result.success) throw new PromptFileError(version, file, z.prettifyError(result.error));
    return result.data;
  }
}
