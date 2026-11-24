import OpenAI from "openai";

export interface ChatRequest {
  model: string;
  /** Omitted for the judge, which (as in the Python version) gets a single user message. */
  system?: string;
  user: string;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface ChatClient {
  complete(request: ChatRequest): Promise<string>;
}

export interface ChatClientOptions {
  /** Any OpenAI-compatible endpoint; Gemini's is the default in .env.example. */
  baseURL: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
}

/** One HTTP client per endpoint; the SDK pools connections and retries 429/5xx itself. */
export function createChatClient(options: ChatClientOptions): ChatClient {
  const client = new OpenAI({
    baseURL: options.baseURL,
    apiKey: options.apiKey,
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries,
  });

  return {
    async complete({ model, system, user, temperature, maxTokens, signal }) {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: user });

      // Gemini "thinking" models spend hidden tokens from this same budget; too
      // low a cap silently returns empty content (see AGENT_MAX_TOKENS).
      const completion = await client.chat.completions.create(
        { model, messages, temperature, max_tokens: maxTokens },
        signal ? { signal } : undefined,
      );
      return completion.choices[0]?.message.content ?? "";
    },
  };
}
