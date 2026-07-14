export function extractFingerprintFromAnchorId(anchorId: string): string {
  return anchorId.replace(/^p_/, "").split("_")[0];
}

export function buildAnchorId(
  fingerprint: string,
  occurrenceIndex: number,
): string {
  return occurrenceIndex === 0
    ? `p_${fingerprint}`
    : `p_${fingerprint}_${occurrenceIndex}`;
}
