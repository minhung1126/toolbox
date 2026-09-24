import { api } from '../../../services/api';
import type {
  SharedTeamPersonFilter,
  SharedTeamPersonFilterResponse,
  SheetTeamOptions,
  SheetTeamPeople,
} from './sheetsFilterTypes';

export type * from './sheetsFilterTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseTeamOptions(value: unknown): SheetTeamOptions {
  if (!isRecord(value) || !isStringList(value.teams)) {
    throw new Error('工作表團體選項回應格式不正確。');
  }
  return value as unknown as SheetTeamOptions;
}

function parseTeamPeople(value: unknown): SheetTeamPeople {
  if (!isRecord(value) || !isStringList(value.people)) {
    throw new Error('工作表人物選項回應格式不正確。');
  }
  return value as unknown as SheetTeamPeople;
}

function parseSharedFilter(value: unknown): SharedTeamPersonFilterResponse {
  if (
    !isRecord(value) ||
    typeof value.configured !== 'boolean' ||
    typeof value.team !== 'string' ||
    !isStringList(value.selected_people)
  ) {
    throw new Error('帳號隊伍／人物篩選回應格式不正確。');
  }
  return value as unknown as SharedTeamPersonFilterResponse;
}

export const sheetsFilterApi = {
  async parseSheetOptions(spreadsheetUrlOrId: string, worksheetName: string): Promise<SheetTeamOptions> {
    const response: unknown = await api.parseSheetOptions(spreadsheetUrlOrId, worksheetName);
    return parseTeamOptions(response);
  },

  async getTeamPeople(spreadsheetUrlOrId: string, worksheetName: string, team: string): Promise<SheetTeamPeople> {
    const response: unknown = await api.getTeamPeople(spreadsheetUrlOrId, worksheetName, team);
    return parseTeamPeople(response);
  },

  async getSharedFilter(): Promise<SharedTeamPersonFilterResponse> {
    const response: unknown = await api.getTeamPersonFilter();
    return parseSharedFilter(response);
  },

  async updateSharedFilter(filter: SharedTeamPersonFilter): Promise<SharedTeamPersonFilterResponse> {
    const response: unknown = await api.updateTeamPersonFilter(filter);
    return parseSharedFilter(response);
  },
};
