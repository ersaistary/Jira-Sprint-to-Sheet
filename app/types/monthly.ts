// app/types/monthly.ts
// Definisi tipe data untuk alur Monthly Report (Laporan Capaian Layanan Publik)

export type SprintItem = {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
};

export type MonthlySourceTask = {
  key: string;
  summary: string;
  status: string;
  created: string;
  resolved: string | null;
  assignee: string;
  reporter: string;
  description: string;
  comments: string;
  sprintIds: number[];
  url: string;
};

export type MonthlyTaskExtraction = {
  key: string;
  kategori: string;
  masuk_laporan: boolean;
  alasan_pengecualian: string;
  kegiatan: string;
  sasaran_kpi: string;
  capaian: string;
  rencana_tindak_lanjut: string;
  perlu_verifikasi: boolean;
  catatan_verifikasi: string;
};

export type MonthlyGroupRow = {
  member_keys: string[];
  kegiatan: string;
  sasaran_kpi: string;
  capaian: string;
  rencana_tindak_lanjut: string;
  perlu_verifikasi?: boolean;
  catatan_verifikasi?: string;
};

export type MonthlySourceTaskMeta = {
  key: string;
  summary: string;
  reporter: string;
  url: string;
  status: string;
  assignee?: string;
};

export type MonthlyRow = {
  no: number;
  kegiatan: string;
  sasaran_kpi: string;
  capaian: string;
  rencana_tindak_lanjut: string;
  tanggal_permohonan: string;
  tanggal_selesai: string;
  status: string;
  pemohon: string;
  data_pendukung: string;
  source_keys: string[];
  needs_verification: boolean;
  verification_note?: string;
  source_tasks?: MonthlySourceTaskMeta[];
};

export type MonthlyExcluded = {
  no: number;
  key: string;
  summary: string;
  assignee: string;
  status: string;
  reason: string;
  needs_verification: boolean;
};

export type MonthlyRekap = {
  totalEntries: number;
  uniqueTasks: number;
  duplicateEntries: number;
  duplicateKeys?: string[];
  includedTasks: number;
  includedRows: number;
  excludedTasks: number;
  needsVerification: number;
  reconciliationValid: boolean;
};

export type MonthlyGenerateResponse = {
  success: boolean;
  rows?: MonthlyRow[];
  excluded?: MonthlyExcluded[];
  rekap?: MonthlyRekap;
  meta?: {
    sprints?: { id: number; name: string }[];
    warnings?: string[];
  };
  error?: string;
};

export type MonthlyCommitResponse = {
  success: boolean;
  link?: string;
  mainSheetTitle?: string;
  followUpSheetTitle?: string;
  count?: number;
  followUpCount?: number;
  requireConfirmation?: boolean;
  error?: string;
};

