export type Role = 'player' | 'compe_admin' | 'super_admin';
export type CompeStatus = 'preparing' | 'active' | 'finished';
export type ContestKind = 'longest' | 'nearest';

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: Role;
}

export interface UserRow extends User {
  status: 'active' | 'suspended';
}

export interface CompeSummary {
  id: string;
  name: string;
  event_date: string;
  course: string;
  status: CompeStatus;
}

export interface AdminCompeSummary extends CompeSummary {
  public_token: string;
  creator: string;
  participants: number;
}

export interface Group {
  id: string;
  number: number;
  start_time: string;
  olympic_on: boolean;
}

export interface Player {
  user_id: string;
  display_name: string;
  group_id: string | null;
}

export interface PenaltyType {
  id: string;
  name: string;
  english_only: boolean;
  custom: boolean;
  visible: boolean;
}

export interface Holes {
  english: number[];
  longest: number[];
  nearest: number[];
}

export interface PenaltyCount {
  user_id: string;
  hole: number;
  type_id: string;
  count: number;
  updated_by: string | null;
}

export interface Leader {
  hole: number;
  kind: ContestKind;
  user_id: string | null;
  updated_by: string | null;
}

export interface CompeBody {
  groups: Group[];
  players: Player[];
  penalty_types: PenaltyType[];
  holes: Holes;
  counts: PenaltyCount[];
  leaders: Leader[];
  display: { longest: boolean; nearest: boolean };
  olympic: OlympicSettings;
  olympic_results: OlympicResult[];
}

export interface CompeState extends CompeBody {
  compe: CompeSummary & {
    local_rules: string;
    version: number;
    can_manage: boolean;
    public_token: string;
  };
  my_group_id: string | null;
}

export interface DashboardData extends CompeBody {
  compe: Omit<CompeSummary, 'id'> & { local_rules: string; version: number };
}

export interface AdminCompeDetail extends CompeSummary {
  local_rules: string;
  public_token: string;
  groups: { number: number; start_time: string; members: string[] }[];
  holes: Holes;
  custom_penalties: { id?: string; name: string; used: number; hidden: boolean }[];
  standard_penalties: { code: string; name: string; hidden: boolean }[];
  display: { longest: boolean; nearest: boolean };
  olympic: OlympicSettings;
}

export interface OlympicSettings {
  enabled: boolean;
  sand: boolean;
  kuzutetsu: boolean;
}

/** オリンピックの 1 ホール・1 人分。state が無い（記録なし）は「未入力」 */
export type OlympicState = 'diamond' | 'ranked' | 'giveup';
export interface OlympicResult {
  user_id: string;
  hole: number;
  state: OlympicState;
  rank: number | null;
  made: boolean;
  sand: boolean;
  updated_by: string | null;
}

export interface LogRow {
  id: number;
  at: string;
  actor: string | null;
  target: string | null;
  hole: number | null;
  item: string;
  before_val: string | null;
  after_val: string | null;
}
