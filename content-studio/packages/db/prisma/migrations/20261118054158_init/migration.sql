-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "GenerationSource" AS ENUM ('STUDIO', 'CLI_IMPORT');

-- CreateTable
CREATE TABLE "generations" (
    "id" UUID NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "source" "GenerationSource" NOT NULL DEFAULT 'STUDIO',
    "current_step" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "topic" TEXT NOT NULL,
    "topic_tokens" TEXT[],
    "tone" TEXT NOT NULL,
    "post_type" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "agent_model" TEXT,
    "judge_model" TEXT,
    "post_content" TEXT,
    "hook" TEXT,
    "validator_score" DOUBLE PRECISION,
    "judge_score" DOUBLE PRECISION,
    "research" JSONB,
    "post" JSONB,
    "validation" JSONB,
    "judge" JSONB,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "failure_code" TEXT,
    "failure_step" TEXT,
    "failure_detail" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generations_created_at_id_idx" ON "generations"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "generations_status_created_at_idx" ON "generations"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "generations_topic_tokens_idx" ON "generations" USING GIN ("topic_tokens");
