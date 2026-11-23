export interface PersonOption {
  team: string;
  person: string;
  kind: 'person' | 'team';
  aliases?: string[];
  team_aliases?: string[];
}

export function personKey(option: PersonOption): string {
  return `person:${JSON.stringify([option.team, option.kind, option.person])}`;
}

export function parsePersonKey(value: string): PersonOption | null {
  if (!value.startsWith('person:')) return null;
  try {
    const parts: unknown = JSON.parse(value.slice(7));
    if (
      !Array.isArray(parts) ||
      parts.length !== 3 ||
      typeof parts[0] !== 'string' ||
      !['person', 'team'].includes(parts[1]) ||
      typeof parts[2] !== 'string'
    )
      return null;
    return { team: parts[0], kind: parts[1], person: parts[2] };
  } catch {
    return null;
  }
}

export function legacyPersonKey(value: string, team: string): string {
  if (parsePersonKey(value)) return value;
  return personKey({
    team,
    kind: value === `${team}（全隊）` ? 'team' : 'person',
    person: value === `${team}（全隊）` ? '' : value,
  });
}

export function personName(option: PersonOption): string {
  return option.kind === 'team' ? `${option.team}（全隊）` : option.person;
}

export function personLabel(value: string): string {
  const option = parsePersonKey(value);
  return option ? `${personName(option)} · ${option.team || '未分團體'}` : value;
}

export function matchesPersonSearch(option: PersonOption, query: string): boolean {
  const fields = [personName(option), option.team, ...(option.aliases || []), ...(option.team_aliases || [])].map(
    (value) => value.toLocaleLowerCase()
  );
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => fields.some((field) => field.includes(term)));
}
