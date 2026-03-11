const IUB_EFFORT_NAMES = ['familjestöd', 'repulse'];

function isIubEffort(name: string): boolean {
  return IUB_EFFORT_NAMES.includes(name.trim().toLowerCase());
}

export function normalizeAvailableFor(name: string, availableFor: string): string {
  if (!availableFor) return availableFor;

  const iub = isIubEffort(name);

  const normalizedTokens = availableFor
    .split(',')
    .map(token => token.trim())
    .filter(token => token.length > 0)
    .map(token => {
      const lower = token.toLowerCase();

      if (lower === 'förebyggande' || lower === 'förebyggande arbete') {
        return iub ? 'IUB' : 'Förebyggande arbete';
      }

      if (lower === 'iub') {
        return iub ? 'IUB' : 'Förebyggande arbete';
      }

      return token;
    });

  const unique = Array.from(new Set(normalizedTokens));
  return unique.join(', ');
}
