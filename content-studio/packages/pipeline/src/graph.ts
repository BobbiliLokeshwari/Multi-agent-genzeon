/**
 * TypeScript port of LinkedInPostGenerator._build_graph:
 *
 *   START → research → write ─ok→ validate → judge → memory → END
 *                           └failed→ END
 *
 * Nodes are pure with respect to their dependencies (prompts, LLM clients,
 * search, memory), which are injected so the graph can be tested with fakes.
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  fill,
  type JudgeData,
  type PipelineIssue,
  type PipelineIssueCode,
  type PipelineStep,
  type PostData,
  type ResearchData,
  type StepEvent,
  type ValidationData,
} from "@studio/shared";
import { describeError } from "./errors";
import { parseJsonObject } from "./json";
import type { ChatClient } from "./llm";
import { formatMemoryContext, type MemoryStore } from "./memory";
import {
  emptyJudge,
  emptyValidation,
  normalizeJudge,
  normalizeValidation,
  normalizeWriterOutput,
  parseResearchInsights,
} from "./normalize";
import type { AgentProfile } from "./prompts/schema";
import type { PromptBundle, PromptStore } from "./prompts/store";
import type { Researcher } from "./research";

export interface PipelineInput {
  runId: string;
  topic: string;
  tone: string;
  postType: string;
  promptVersion: string;
}

/** A model plus the sampling settings it runs with. */
export interface LlmRole {
  client: ChatClient;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface PipelineSettings {
  memory: { topK: number; minOverlap: number; snippetChars: number };
  /** BCP-47 locale of the generated posts; used for word counting. */
  contentLocale: string;
}

export interface PipelineDeps {
  prompts: Pick<PromptStore, "load">;
  agent: LlmRole;
  /** null disables the judge (JUDGE_ENABLED=false). */
  judge: LlmRole | null;
  researcher: Researcher;
  memory: MemoryStore;
  settings: PipelineSettings;
}

interface ResearchOutput extends ResearchData {
  /** Exactly what the writer and validator are given. Kept in graph state only. */
  insightsText: string;
}

// State keys must differ from node names (LangGraph treats both as channels).
const PipelineState = Annotation.Root({
  input: Annotation<PipelineInput>(),
  researchOutput: Annotation<ResearchOutput | undefined>(),
  writerOutput: Annotation<PostData | undefined>(),
  validatorOutput: Annotation<ValidationData | undefined>(),
  judgeOutput: Annotation<JudgeData | undefined>(),
  issues: Annotation<PipelineIssue[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
});
type State = typeof PipelineState.State;

/** What a node returns: a partial state. Narrower than LangGraph's Update type on purpose. */
interface NodeUpdate {
  researchOutput?: ResearchOutput;
  writerOutput?: PostData;
  validatorOutput?: ValidationData;
  judgeOutput?: JudgeData;
  issues?: PipelineIssue[];
}

function issue(step: PipelineStep, code: PipelineIssueCode, detail: string | null): PipelineIssue {
  return { step, code, detail };
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`pipeline state is missing ${name}`);
  return value;
}

function publicResearch({ insightsText: _omit, ...research }: ResearchOutput): ResearchData {
  return research;
}

export function createPipeline(deps: PipelineDeps) {
  const { prompts, agent, judge, researcher, memory, settings } = deps;

  function askAgent(bundle: PromptBundle, profile: AgentProfile, user: string): Promise<string> {
    return agent.client.complete({
      model: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      system: fill(bundle.pipeline.agentSystemPrompt, { ...profile }),
      user,
    });
  }

  async function research(state: State): Promise<NodeUpdate> {
    const { topic, postType, promptVersion } = state.input;
    const bundle = await prompts.load(promptVersion);
    const queries = bundle.pipeline.researchQueries.map((query) => fill(query, { topic }));
    const outcomes = await researcher.searchAll(queries);

    const issues = outcomes.flatMap((outcome) =>
      outcome.error ? [issue("research", "RESEARCH_SEARCH_FAILED", `${outcome.query}: ${outcome.error}`)] : [],
    );
    const sources = outcomes.flatMap((outcome) => outcome.sources);
    // Same JSON shape the Python pipeline gave research_task.md.
    const researchData = JSON.stringify(
      { topic, key_facts: [], trending_angles: [], sources },
      null,
      2,
    );

    let insightsText = "";
    try {
      insightsText = await askAgent(
        bundle,
        bundle.agents.research,
        fill(bundle.tasks.research, { topic, post_type: postType, research_data: researchData }),
      );
    } catch (error) {
      issues.push(issue("research", "RESEARCH_SYNTHESIS_FAILED", describeError(error)));
    }
    if (!insightsText.trim()) {
      if (!issues.some((entry) => entry.code === "RESEARCH_SYNTHESIS_FAILED")) {
        issues.push(issue("research", "RESEARCH_SYNTHESIS_EMPTY", null));
      }
      insightsText = researchData; // Fall back to the raw search results, as before.
    }

    return {
      researchOutput: {
        queries,
        sources: sources.map(({ title, url }) => ({ title, url })),
        insights: parseResearchInsights(insightsText),
        insightsText,
      },
      issues,
    };
  }

  async function write(state: State): Promise<NodeUpdate> {
    const { topic, tone, postType, promptVersion } = state.input;
    const bundle = await prompts.load(promptVersion);
    const researchOutput = required(state.researchOutput, "researchOutput");
    const past = await memory.findRelevant(topic, {
      limit: settings.memory.topK,
      minOverlap: settings.memory.minOverlap,
    });
    const task = fill(bundle.tasks.writing, {
      topic,
      tone,
      post_type: postType,
      research_insights: researchOutput.insightsText,
      memory_context: formatMemoryContext(
        past,
        bundle.pipeline.memoryContext,
        settings.memory.snippetChars,
      ),
    });
    try {
      const raw = await askAgent(bundle, bundle.agents.writer, task);
      return { writerOutput: normalizeWriterOutput(parseJsonObject(raw), settings.contentLocale) };
    } catch (error) {
      return { issues: [issue("write", "WRITER_FAILED", describeError(error))] };
    }
  }

  const routeAfterWrite = (state: State) => (state.writerOutput ? "ok" : "failed");

  async function validate(state: State): Promise<NodeUpdate> {
    const { tone, promptVersion } = state.input;
    const bundle = await prompts.load(promptVersion);
    const task = fill(bundle.tasks.validation, {
      post_content: required(state.writerOutput, "writerOutput").content,
      research_insights: required(state.researchOutput, "researchOutput").insightsText,
      tone,
    });
    try {
      const raw = await askAgent(bundle, bundle.agents.validator, task);
      return { validatorOutput: normalizeValidation(parseJsonObject(raw)) };
    } catch (error) {
      return {
        validatorOutput: emptyValidation(),
        issues: [issue("validate", "VALIDATOR_FAILED", describeError(error))],
      };
    }
  }

  async function judgePost(state: State): Promise<NodeUpdate> {
    if (!judge) {
      return { judgeOutput: emptyJudge(null), issues: [issue("judge", "JUDGE_DISABLED", null)] };
    }
    const { topic, tone, postType, promptVersion } = state.input;
    const bundle = await prompts.load(promptVersion);
    const prompt = fill(bundle.judge, {
      post_content: required(state.writerOutput, "writerOutput").content,
      topic,
      tone,
      post_type: postType,
    });
    try {
      const raw = await judge.client.complete({
        model: judge.model,
        temperature: judge.temperature,
        maxTokens: judge.maxTokens,
        user: prompt,
      });
      return { judgeOutput: normalizeJudge(parseJsonObject(raw), judge.model) };
    } catch (error) {
      return {
        judgeOutput: emptyJudge(judge.model),
        issues: [issue("judge", "JUDGE_FAILED", describeError(error))],
      };
    }
  }

  async function remember(state: State): Promise<NodeUpdate> {
    await memory.save({
      runId: state.input.runId,
      research: publicResearch(required(state.researchOutput, "researchOutput")),
      post: required(state.writerOutput, "writerOutput"),
      validation: required(state.validatorOutput, "validatorOutput"),
      judge: required(state.judgeOutput, "judgeOutput"),
      issues: state.issues,
    });
    return {};
  }

  // Compiled once per process and reused for every job.
  const graph = new StateGraph(PipelineState)
    .addNode("research" satisfies PipelineStep, research)
    .addNode("write" satisfies PipelineStep, write)
    .addNode("validate" satisfies PipelineStep, validate)
    .addNode("judge" satisfies PipelineStep, judgePost)
    .addNode("memory" satisfies PipelineStep, remember)
    .addEdge(START, "research")
    .addEdge("research", "write")
    .addConditionalEdges("write", routeAfterWrite, { ok: "validate", failed: END })
    .addEdge("validate", "judge")
    .addEdge("judge", "memory")
    .addEdge("memory", END)
    .compile();

  /** Runs the graph and yields one StepEvent per finished node. */
  async function* run(
    input: PipelineInput,
    options: { signal?: AbortSignal } = {},
  ): AsyncGenerator<StepEvent> {
    const issues: PipelineIssue[] = [];
    const stream = await graph.stream(
      { input },
      { streamMode: "updates", ...(options.signal ? { signal: options.signal } : {}) },
    );
    for await (const chunk of stream) {
      for (const [node, raw] of Object.entries(chunk as Record<string, NodeUpdate | undefined>)) {
        const update = raw ?? {};
        if (update.issues) issues.push(...update.issues);
        const soFar = [...issues];
        switch (node) {
          case "research":
            yield {
              step: "research",
              data: publicResearch(required(update.researchOutput, "researchOutput")),
              issues: soFar,
            };
            break;
          case "write":
            yield { step: "write", data: update.writerOutput ?? null, issues: soFar };
            break;
          case "validate":
            yield {
              step: "validate",
              data: required(update.validatorOutput, "validatorOutput"),
              issues: soFar,
            };
            break;
          case "judge":
            yield { step: "judge", data: required(update.judgeOutput, "judgeOutput"), issues: soFar };
            break;
          case "memory":
            yield { step: "memory", data: null, issues: soFar };
            break;
          default:
            break; // Internal LangGraph channels; nothing to report.
        }
      }
    }
  }

  return { run };
}

export type Pipeline = ReturnType<typeof createPipeline>;
