import type { YoutubeDraftVideoType } from '../api/youtubeBatchTypes';
import type { YoutubeRoutingState } from './routing';
import type { readSharedTeamPersonFilter } from '../../../utils/teamPersonFilterStorage';
export interface BatchConfig {
  spreadsheetId: string;
  playlistId: string;
  worksheetName: string;
  titleColumn: string;
  descriptionColumn: string;
  selectedTeam: string;
  selectedPeople: string[];
}
export interface BatchWorkflowOptions {
  sysSettings: {
    default_spreadsheet_id?: string;
    default_playlist_id?: string;
    shared_team_person_filter?: Parameters<typeof readSharedTeamPersonFilter>[0];
  };
  authUser?: { sub?: string; email?: string; youtube?: YoutubeRoutingState } | null;
  videoType: YoutubeDraftVideoType;
  toast: { warning(message: string): void; success(message: string): void; error(message: string): void };
}
