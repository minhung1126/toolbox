import type { PersonOption } from '../model/personOptions';

export interface SheetTeamOptions {
  teams: string[];
  people: PersonOption[];
  spreadsheet_id?: string;
  worksheet_name?: string;
  row_count?: number;
}

export interface SheetTeamPeople {
  people: string[];
  team?: string;
  worksheet_name?: string;
}

export interface SharedTeamPersonFilter {
  team: string;
  teams?: string[];
  query?: string;
  selectedPeople: string[];
}

export interface SharedTeamPersonFilterResponse {
  configured: boolean;
  team: string;
  teams?: string[];
  query?: string;
  selected_people: string[];
}
