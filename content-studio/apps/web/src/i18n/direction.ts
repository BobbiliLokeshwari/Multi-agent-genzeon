type LocaleWithTextInfo = Intl.Locale & {
  getTextInfo?: () => { direction?: string };
  textInfo?: { direction?: string };
};

/** Writing direction from Intl's locale data, so adding an RTL locale needs no code change. */
export function textDirection(locale: string): "ltr" | "rtl" {
  const info = new Intl.Locale(locale) as LocaleWithTextInfo;
  const direction = info.getTextInfo?.().direction ?? info.textInfo?.direction;
  return direction === "rtl" ? "rtl" : "ltr";
}
