import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readStylesheet(name) {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

describe('shared design tokens', () => {
  it('defines each custom property once in the shared token sheet', () => {
    const tokens = readStylesheet('./tokens.css');
    const declarations = [...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]);

    expect(tokens).toMatch(/:root\s*\{/);
    expect(new Set(declarations).size).toBe(declarations.length);
    expect(readStylesheet('../index.css')).not.toMatch(/:root\s*\{[^}]*--/s);
    expect(readStylesheet('./foundation.css')).not.toMatch(/:root\s*\{[^}]*--/s);
    expect(readStylesheet('./app-theme.css')).not.toMatch(/:root\s*\{[^}]*--/s);
  });
});
