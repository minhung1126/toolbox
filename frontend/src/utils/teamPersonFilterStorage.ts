function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePeople(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeText).filter(Boolean))];
}

export function normalizeTeamPersonFilter(
  value: { team?: unknown; selectedPeople?: unknown; selected_people?: unknown } = {}
) {
  const people = value?.selectedPeople ?? value?.selected_people;
  return {
    team: normalizeText(value?.team),
    selectedPeople: normalizePeople(people),
  };
}

export function readSharedTeamPersonFilter(
  serverFilter: {
    configured?: boolean;
    team?: unknown;
    selectedPeople?: unknown;
    selected_people?: unknown;
  } | null = null
) {
  if (serverFilter?.configured) {
    return { ...normalizeTeamPersonFilter(serverFilter), exists: true, pending: false, source: 'server' };
  }

  return { ...normalizeTeamPersonFilter(), exists: false, pending: false, source: 'default' };
}
