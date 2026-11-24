export class PromptVersionNotFoundError extends Error {
  override readonly name = "PromptVersionNotFoundError";
  constructor(readonly version: string) {
    super(`Prompt version "${version}" does not exist`);
  }
}

export class PromptFileError extends Error {
  override readonly name = "PromptFileError";
  constructor(
    readonly version: string,
    readonly file: string,
    reason: string,
  ) {
    super(`prompts/${version}/${file}: ${reason}`);
  }
}

export { describeError } from "@studio/shared";
