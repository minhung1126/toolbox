export interface SheetTeamOptions {
  teams: string[];
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
  selectedPeople: string[];
}

export interface SharedTeamPersonFilterResponse {
  configured: boolean;
  team: string;
  selected_people: string[];
}
