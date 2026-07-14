export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/library";
  }

  try {
    const parsed = new URL(value, "https://ke-doc.local");
    if (parsed.origin !== "https://ke-doc.local") {
      return "/library";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/library";
  }
}
