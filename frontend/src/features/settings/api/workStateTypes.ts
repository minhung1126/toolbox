export type WorkStateValue = Record<string, unknown>;

export interface AccountWorkStateResponse {
  version?: 1;
  state: Record<string, WorkStateValue>;
}
