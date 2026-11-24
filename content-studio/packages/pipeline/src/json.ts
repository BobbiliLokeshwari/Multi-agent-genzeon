/** A Markdown code fence, optionally tagged (```json). Port of the Python regex. */
const FENCE = /```[a-zA-Z]*\s*([\s\S]*?)\s*```/;

/**
 * Port of `_parse_json_object`: models often wrap JSON in a code fence, in
 * prose, or leave a fence unclosed. Try the fenced body (or the whole reply),
 * then fall back to the outermost `{ … }` span.
 */
export function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) throw new Error("empty LLM response");
  const fenced = FENCE.exec(raw);
  const candidate = fenced?.[1] ?? raw.trim();

  let data: unknown;
  try {
    data = JSON.parse(candidate);
  } catch (error) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) throw error;
    data = JSON.parse(candidate.slice(start, end + 1));
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    const kind = data === null ? "null" : Array.isArray(data) ? "array" : typeof data;
    throw new Error(`expected a JSON object, got ${kind}`);
  }
  return data as Record<string, unknown>;
}
