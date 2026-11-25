# Backend image for Railway: one image runs both the API and the worker.
# Build context is the REPO ROOT (the image needs ../prompts), so on Railway set
#   RAILWAY_DOCKERFILE_PATH=content-studio/Dockerfile
# and choose the process with the service's start command:
#   API:    npm run start -w @studio/api
#   Worker: npm run start -w @studio/worker
#
# Local test (from the repo root):
#   docker build -f content-studio/Dockerfile -t content-studio-backend .

FROM node:22-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Prompts live outside content-studio; PROMPTS_DIR=../prompts resolves to /app/prompts.
COPY prompts ./prompts
COPY content-studio ./content-studio

WORKDIR /app/content-studio

# Dev dependencies are needed for the build (tsup) and migrations (prisma CLI).
RUN npm ci --include=dev \
    && npm run generate -w @studio/db \
    && npm run build -w @studio/api \
    && npm run build -w @studio/worker

ENV NODE_ENV=production \
    PROMPTS_DIR=../prompts \
    API_HOST=0.0.0.0 \
    API_PORT=8080 \
    LOG_PRETTY=false

EXPOSE 8080

# Default process is the API; the worker service overrides this start command.
CMD ["npm", "run", "start", "-w", "@studio/api"]
