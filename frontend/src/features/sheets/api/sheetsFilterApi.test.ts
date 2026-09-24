import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { sheetsFilterApi } from './sheetsFilterApi';

vi.mock('../../../services/api', () => ({
  api: {
    parseSheetOptions: vi.fn(),
    getTeamPeople: vi.fn(),
    getTeamPersonFilter: vi.fn(),
    updateTeamPersonFilter: vi.fn(),
  },
}));

describe('sheetsFilterApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes valid ordered team and people options through', async () => {
    api.parseSheetOptions.mockResolvedValue({ teams: ['團體 B', '團體 A'] });
    api.getTeamPeople.mockResolvedValue({ people: ['全團體', '乙', '甲'] });

    await expect(sheetsFilterApi.parseSheetOptions('sheet-id', '工作表')).resolves.toEqual({
      teams: ['團體 B', '團體 A'],
    });
    await expect(sheetsFilterApi.getTeamPeople('sheet-id', '工作表', '團體 A')).resolves.toEqual({
      people: ['全團體', '乙', '甲'],
    });
    expect(api.parseSheetOptions).toHaveBeenCalledWith('sheet-id', '工作表');
    expect(api.getTeamPeople).toHaveBeenCalledWith('sheet-id', '工作表', '團體 A');
  });

  it('rejects malformed options instead of treating them as empty lists', async () => {
    api.parseSheetOptions.mockResolvedValue({ teams: [null] });
    api.getTeamPeople.mockResolvedValue({ people: '甲' });

    await expect(sheetsFilterApi.parseSheetOptions('sheet-id', '工作表')).rejects.toThrow('團體選項回應格式不正確');
    await expect(sheetsFilterApi.getTeamPeople('sheet-id', '工作表', '團體')).rejects.toThrow('人物選項回應格式不正確');
  });

  it('validates account filter reads and writes', async () => {
    const filter = { configured: true, team: '團體', selected_people: ['甲'] };
    api.getTeamPersonFilter.mockResolvedValue(filter);
    api.updateTeamPersonFilter.mockResolvedValue(filter);

    await expect(sheetsFilterApi.getSharedFilter()).resolves.toEqual(filter);
    await expect(sheetsFilterApi.updateSharedFilter({ team: '團體', selectedPeople: ['甲'] })).resolves.toEqual(filter);
    expect(api.updateTeamPersonFilter).toHaveBeenCalledWith({ team: '團體', selectedPeople: ['甲'] });

    api.getTeamPersonFilter.mockResolvedValue({ configured: true, selected_people: '甲' });
    await expect(sheetsFilterApi.getSharedFilter()).rejects.toThrow('帳號隊伍／人物篩選回應格式不正確');
  });
});
