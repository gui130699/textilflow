export type Row = { id: string; [key: string]: unknown };
export type Company = Row & {
  name: string;
  tradeName?: string;
  role: "inspector" | "owner";
  active: boolean;
};
export type Project = Row & {
  name: string;
  planned: number;
  cut: number;
  balances: Record<string, number>;
  dueOn: string;
  status: string;
  stages: string[];
  thirdPartyIds: string[];
  modelingStatus: string;
};
