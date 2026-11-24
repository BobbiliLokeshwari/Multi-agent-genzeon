export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** First value of a query parameter, or undefined. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "" ? undefined : first;
}
