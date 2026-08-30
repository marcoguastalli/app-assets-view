/**
 * Parse an integer env var with a floor and a fallback. A missing or
 * non-numeric value returns the fallback instead of NaN — a NaN limit
 * silently disables anything compared against it (e.g. a concurrency
 * check like `running < NaN` is always false, so a queue never drains).
 */
export function envInt(name: string, fallback: number, min = 1): number {
  const parsed = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}
