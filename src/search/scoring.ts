export function normalizeSearchQuery(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeSearchQuery(value)
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
    }
    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[right.length];
}

function fuzzyTokenScore(queryToken: string, candidateToken: string): number {
  if (!queryToken || !candidateToken) return 0;
  if (candidateToken === queryToken) return 10;
  if (candidateToken.startsWith(queryToken)) return 8;
  if (candidateToken.includes(queryToken)) return 6;
  const distance = levenshtein(queryToken, candidateToken);
  const tolerance = Math.max(1, Math.floor(queryToken.length / 3));
  return distance <= tolerance ? Math.max(1, 5 - distance) : 0;
}

export function scoreSearchMatch(query: string, ...fields: Array<string | null | undefined>): number {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return 1;

  const haystack = fields
    .map(field => normalizeSearchQuery(field))
    .filter(Boolean)
    .join(' ');

  if (!haystack) return 0;
  if (haystack === normalizedQuery) return 100;
  if (haystack.startsWith(normalizedQuery)) return 90;
  if (haystack.includes(normalizedQuery)) return 80;

  const queryTokens = tokenize(normalizedQuery);
  const haystackTokens = tokenize(haystack);
  if (queryTokens.length === 0 || haystackTokens.length === 0) return 0;

  let score = 0;
  for (const queryToken of queryTokens) {
    let best = 0;
    for (const candidateToken of haystackTokens) {
      best = Math.max(best, fuzzyTokenScore(queryToken, candidateToken));
      if (best >= 10) break;
    }
    if (best === 0) return 0;
    score += best;
  }

  return score;
}
