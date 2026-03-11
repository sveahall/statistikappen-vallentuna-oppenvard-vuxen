import fs from 'fs';
import path from 'path';

describe('StatistikPage export integration surface (static)', () => {
  test('Does not read token from localStorage and uses /audit/export via apiClient', () => {
    const file = path.resolve(__dirname, '../../src/screens/StatistikPage/StatistikPage.tsx');
    const src = fs.readFileSync(file, 'utf8');
    expect(src).not.toMatch(/localStorage\.getItem\(\s*['"]token['"]\s*\)/);
    expect(src).toMatch(/api\('\/audit\/export'|api\("\/audit\/export"/);
  });
});

