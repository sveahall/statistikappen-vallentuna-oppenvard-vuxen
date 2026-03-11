const IUB_EFFORTS = ['Familjestöd', 'rePULSE'];

export function formatAvailableFor(effortName: string | undefined, availableFor: string | undefined): string {
  if (!availableFor) return '';

  const tokens = availableFor
    .split(',')
    .map(token => token.trim())
    .filter(token => token.length > 0);

  const isIubEffort = effortName
    ? IUB_EFFORTS.some(name => name.toLowerCase() === effortName.toLowerCase())
    : false;

  const mapped = tokens.map(token => {
    const lower = token.toLowerCase();

    if (lower === 'förebyggande' || lower === 'förebyggande arbete') {
      return isIubEffort ? 'IUB' : 'Förebyggande arbete';
    }

    if (lower === 'iub') {
      return isIubEffort ? 'IUB' : 'Förebyggande arbete';
    }

    return token;
  });

  return mapped.join(', ');
}
