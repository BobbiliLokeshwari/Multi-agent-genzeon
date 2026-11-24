import { z } from "zod";

/** <name>_agent.yaml */
export const agentProfileSchema = z.object({
  role: z.string().min(1),
  goal: z.string().min(1),
  backstory: z.string().min(1),
});
export type AgentProfile = z.output<typeof agentProfileSchema>;

/** pipeline.yaml */
export const pipelineTemplatesSchema = z
  .object({
    research_queries: z.array(z.string().min(1)).min(1),
    agent_system_prompt: z.string().min(1),
    memory_context: z.object({
      empty: z.string().min(1),
      header: z.string().min(1),
      entry: z.string().min(1),
      not_available: z.string().min(1),
    }),
  })
  .transform((raw) => ({
    researchQueries: raw.research_queries,
    agentSystemPrompt: raw.agent_system_prompt,
    memoryContext: {
      empty: raw.memory_context.empty,
      header: raw.memory_context.header,
      entry: raw.memory_context.entry,
      notAvailable: raw.memory_context.not_available,
    },
  }));
export type PipelineTemplates = z.output<typeof pipelineTemplatesSchema>;
export type MemoryTemplates = PipelineTemplates["memoryContext"];
