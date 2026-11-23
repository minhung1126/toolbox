import { legacyPersonKey, personKey } from '../features/sheets/model/personOptions';
import { describe, expect, it } from 'vitest';
import { normalizeTeamPersonFilter, readSharedTeamPersonFilter } from './teamPersonFilterStorage';

describe('teamPersonFilterStorage', () => {
  it('normalizes the browser and server field names', () => {
    expect(normalizeTeamPersonFilter({ team: ' 團體 ', selected_people: [' 甲 ', '甲', ''] })).toEqual({
      team: '團體',
      teams: ['團體'],
      query: '',
      selectedPeople: [legacyPersonKey('甲', '團體')],
    });
  });

  it('uses the server record when configured', () => {
    expect(readSharedTeamPersonFilter({ configured: true, team: '伺服器團體', selected_people: ['乙'] })).toMatchObject(
      {
        team: '伺服器團體',
        selectedPeople: [legacyPersonKey('乙', '伺服器團體')],
        source: 'server',
      }
    );
  });

  it('uses an empty default without a server or local record', () => {
    expect(readSharedTeamPersonFilter()).toEqual({
      team: '',
      teams: [],
      query: '',
      selectedPeople: [],
      exists: false,
      pending: false,
      source: 'default',
    });
  });
});

it('round trips cross-team keys, whole-team type and filters without reinterpreting them', () => {
  const keys = [
    personKey({ team: 'A', person: '甲', kind: 'person' }),
    personKey({ team: 'B', person: '甲', kind: 'person' }),
    personKey({ team: 'A', person: '', kind: 'team' }),
  ];
  expect(normalizeTeamPersonFilter({ teams: ['B'], query: 'a 甲', selectedPeople: keys })).toEqual({
    team: '',
    teams: ['B'],
    query: 'a 甲',
    selectedPeople: keys,
  });
});
