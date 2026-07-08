export function allowLocalDataFallback(flagName: string): boolean {
  return process.env.NODE_ENV !== 'production' && process.env[flagName] === '1';
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function formatCountLabel(value: number | null | undefined, singular: string, plural = `${singular}s`): string {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count) || count <= 0) return `No ${plural} yet`;
  return `${formatCompactNumber(count)} ${count === 1 ? singular : plural}`;
}

export function formatMetricCount(value: number | null | undefined, emptyLabel = 'No records yet'): string {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count) || count <= 0) return emptyLabel;
  return formatCompactNumber(count);
}

export function formatRatingLabel(rating: number | null | undefined, reviewCount?: number | null): string {
  const score = Number(rating ?? 0);
  const reviews = Number(reviewCount ?? 0);
  if (!Number.isFinite(score) || score <= 0 || reviews <= 0) return 'New';
  return `${score.toFixed(1)} rating`;
}

export function formatMoneyMetric(value: string | number | null | undefined, emptyLabel = 'No revenue recorded'): string {
  if (value === null || value === undefined || value === '') return emptyLabel;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return emptyLabel;
  return `$${amount.toFixed(2)}`;
}
