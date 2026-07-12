type TelemetryFields = Record<string, string | number | boolean | undefined>;

/**
 * IDs, counts, status and timing only — never prose/content (PRD §14.5).
 */
export function logEvent(name: string, fields?: TelemetryFields) {
  console.log(
    JSON.stringify({ event: name, ts: new Date().toISOString(), ...fields }),
  );
}
