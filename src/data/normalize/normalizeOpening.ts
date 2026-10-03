export function normalizeOpening(pgn: string, ecoUrl?: string) {
  const tag = (key: string) =>
    pgn.match(new RegExp(`\\[${key} "([^"\\r\\n]*)"\\]`))?.[1] ?? null;
  const url = tag("ECOUrl") ?? ecoUrl;
  let name = tag("Opening");
  if (!name && url) {
    try {
      name =
        decodeURIComponent(
          new URL(url).pathname.split("/openings/")[1] ?? "",
        ).replace(/-/g, " ") || null;
    } catch {
      /* Malformed source tags stay unknown. */
    }
  }
  const suppliedVariation = tag("Variation");
  if (!tag("Opening") && name) {
    const family = name.match(
      /^(.+?\b(?:Game|Defense|Opening|Attack|Gambit|System))\b(?:[\s.:]+(.+))?$/i,
    );
    if (family)
      return {
        eco: tag("ECO"),
        openingName: family[1],
        variation: suppliedVariation ?? family[2] ?? null,
      };
  }
  if (name) {
    const parts = name.split(/:\s*/);
    if (parts.length > 1) {
      name = parts[0];
      return {
        eco: tag("ECO"),
        openingName: name,
        variation: suppliedVariation ?? parts.slice(1).join(": "),
      };
    }
  }
  return { eco: tag("ECO"), openingName: name, variation: suppliedVariation };
}
