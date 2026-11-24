# Content Studio

A web front end for the LinkedIn multi-agent pipeline (`../linkedin_generator.py`), with the
pipeline ported to TypeScript. You queue a topic, a worker runs research → write → validate →
judge → memory, and the browser watches each step arrive live.

```
browser ──► Next.js (apps/web, :3000) ──► Fastify API (apps/api, :4000) ──► Postgres  (runs + memory)
   ▲                                          │  enqueue                  ▲
   └──────── Server-Sent Events ◄─────────────┤                           │
                                              ▼                           │
                                     Redis / BullMQ ──► Worker (apps/worker): LangGraph pipeline
                                                                ├─ Gemini (OpenAI-compatible API)
                                                                └─ Tavily search
```

| Package | What it holds |
| --- | --- |
| `packages/shared` | Catalog (tones, post types, steps), DTOs, error codes, request schemas, env helpers |
| `packages/db` | Prisma schema, migrations, repository, CLI history importer |
| `packages/pipeline` | The LangGraph port: prompt loading, LLM client, Tavily, memory formatting, graph |
| `apps/api` | REST + SSE: `/v1/catalog`, `/v1/generations`, `/v1/generations/:id/events`, `/v1/insights`, `/v1/prompts`, `/health` |
| `apps/worker` | BullMQ worker that runs the pipeline and records every step |
| `apps/web` | Next.js 16 App Router UI: Generate, History, Insights, Prompts (next-intl, English) |

Prompts are read from `../prompts/<version>/` — the same files the Python CLI uses — plus
`pipeline.yaml`, which holds the research queries and memory wording the Python code hard-codes.

## Run it locally

Requirements: Node.js 22.12+ and Docker Desktop.

```bash
cd content-studio
cp .env.example .env              # then set GEMINI_API_KEY and TAVILY_API_KEY
npm install                       # also generates the Prisma client
npm run infra:up                  # Postgres + Redis in Docker
npm run db:deploy                 # create the tables
npm run db:import-history         # optional: import ../memory/posts_history.json
npm run dev                       # api :4000, worker, web :3000
```

Open http://localhost:3000.

If a port is taken (for example another Postgres on 5432), change `POSTGRES_PORT` and the port in
`DATABASE_URL` in `.env`. Every port, limit, model and timeout is configured there.

## Everyday commands

| Command | Does |
| --- | --- |
| `npm run dev` | All three apps with reload |
| `npm run check` | Format check, lint, typecheck, tests |
| `npm test` | Unit tests (Node's built-in runner) |
| `npm run db:migrate -- --name <change>` | New migration after editing `schema.prisma` |
| `npm run db:studio` | Browse the database |
| `npm run build && npm run start` | Production build and start |
| `npm run infra:down` | Stop Postgres and Redis (data is kept in Docker volumes) |

## Differences from the Python CLI

- Scores are stored as numbers (`"9/10"` becomes `9`), so sorting and charts work.
- Research errors and every other fallback are recorded as warnings and shown in the UI.
- The three Tavily searches run in parallel, and a failed search no longer discards the others.
- Memory ignores past posts that share no words with the topic (`MEMORY_MIN_OVERLAP=1`; set `0` for the old behaviour).
- The judge can use its own model and endpoint (`JUDGE_MODEL`, `JUDGE_BASE_URL`, `JUDGE_API_KEY`).
- Word count is measured, not taken from the model.
