const SIGNIN_HINTS_STORAGE_KEY = 'agentos.signin.lookupHints.v1';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readHints(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SIGNIN_HINTS_STORAGE_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1])),
    );
  } catch {
    return {};
  }
}

export function readSigninLookupHint(email: string): string | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  return readHints()[normalizedEmail] ?? null;
}

export function rememberSigninLookupHint(email: string, hint: string | null | undefined): void {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !hint) return;
  if (typeof window === 'undefined') return;
  try {
    const hints = readHints();
    hints[normalizedEmail] = hint;
    window.localStorage.setItem(SIGNIN_HINTS_STORAGE_KEY, JSON.stringify(hints));
  } catch {
    // Re-login hints are an optimization only.
  }
}
