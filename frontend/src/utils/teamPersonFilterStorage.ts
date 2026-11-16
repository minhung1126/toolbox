import { legacyPersonKey } from '../features/sheets/model/personOptions';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePeople(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeText).filter(Boolean))];
}

export function normalizeTeamPersonFilter(
  value: { team?: unknown; teams?: unknown; query?: unknown; selectedPeople?: unknown; selected_people?: unknown } = {}
) {
  const people = value?.selectedPeople ?? value?.selected_people;
  return {
    team: normalizeText(value?.team),
    teams: Array.isArray(value?.teams) ? normalizePeople(value.teams) : value?.team ? [normalizeText(value.team)] : [],
    query: typeof value?.query === 'string' ? value.query : '',
    selectedPeople: [
      ...new Set(normalizePeople(people).map((person) => legacyPersonKey(person, normalizeText(value?.team)))),
    ],
  };
}

export function readSharedTeamPersonFilter(
  serverFilter: {
    configured?: boolean;
    team?: unknown;
    teams?: unknown;
    query?: unknown;
    selectedPeople?: unknown;
    selected_people?: unknown;
  } | null = null
) {
  if (serverFilter?.configured) {
    return { ...normalizeTeamPersonFilter(serverFilter), exists: true, pending: false, source: 'server' };
  }

  return { ...normalizeTeamPersonFilter(), exists: false, pending: false, source: 'default' };
}
