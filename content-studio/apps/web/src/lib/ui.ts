/** UI timing and layout tokens shared by components. */
export const UI = {
  /** How long "Copied" stays on the copy button. */
  copyFeedbackMs: 2_000,
  dateTimeFormat: { dateStyle: "medium", timeStyle: "short" },
  scoreFormat: { maximumFractionDigits: 1 },
} as const satisfies Record<string, unknown>;
