/**
 * Port of Python's `string.Template.safe_substitute`, which the original
 * pipeline uses for every prompt file:
 *   - `$$` becomes `$`
 *   - `$name` and `${name}` are replaced when `name` is provided
 *   - anything else (unknown names, a lone `$`) is left exactly as written
 * Identifiers follow Python's default pattern: [_a-z][_a-z0-9]*, ASCII, any case.
 *
 * Substitution is a single pass over the template, so values that themselves
 * contain `$` (research text such as "$17 billion") are never re-expanded.
 */
const PLACEHOLDER = /\$(?:(\$)|([_a-z][_a-z0-9]*)|\{([_a-z][_a-z0-9]*)\})/gi;

export type TemplateValues = Readonly<Record<string, string | number>>;

export function fill(template: string, values: TemplateValues): string {
  return template.replace(
    PLACEHOLDER,
    (match, escaped: string | undefined, named: string | undefined, braced: string | undefined) => {
      if (escaped) return "$";
      const key = (named ?? braced) as string;
      return Object.hasOwn(values, key) ? String(values[key]) : match;
    },
  );
}

/** Distinct placeholder names in a template, in order of first appearance. */
export function listPlaceholders(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[2] ?? match[3];
    if (name) names.add(name);
  }
  return [...names];
}

export interface TemplatePart {
  text: string;
  /** Set when this part is a placeholder ($name or ${name}). */
  placeholder?: string;
}

/** Splits a template into literal text and placeholders, e.g. for highlighting in the UI. */
export function splitTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[2] ?? match[3];
    if (!name) continue; // `$$` stays literal text.
    if (match.index > last) parts.push({ text: template.slice(last, match.index) });
    parts.push({ text: match[0], placeholder: name });
    last = match.index + match[0].length;
  }
  if (last < template.length) parts.push({ text: template.slice(last) });
  return parts;
}
