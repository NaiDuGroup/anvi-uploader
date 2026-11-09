import type { DurationStats } from "./pure";

/** One row of «время в статусе»: `section` null = all sections. */
export interface StatusTimeRow extends DurationStats {
  status: string;
  section: string | null;
}

export interface WorkshopAnalyticsReport {
  period: { from: string; to: string; days: number };
  includeTest: boolean;
  generatedAt: string;
  /** First log rows ever recorded (data before them does not exist). */
  logSince: { orderLog: string | null; lineStatus: string | null };
  kpi: {
    created: number;
    delivered: number;
    problemOrders: number;
    urgentOrders: number;
    leadDelivered: DurationStats;
    leadReady: DurationStats;
  };
  orderStatusTime: StatusTimeRow[];
  lineStatusTime: StatusTimeRow[];
  slowestOrderStatus: string | null;
  slowestLineStatus: string | null;
  fileProblems: {
    problemOrders: number;
    issueOrders: number;
    flaggedOrders: number;
    lineFlags: number;
    byDealer: { clientId: string; name: string; orders: number; problems: number }[];
    bySection: { section: string; orders: number; problems: number }[];
    /** `source`: order ISSUE picker or line «Проблема с файлом»; `code` from the stored key or the mapped label. */
    reasons: { source: "order" | "line"; code: string; count: number }[];
    /** Most frequent own texts of «Другое». */
    customTexts: { text: string; count: number }[];
    issueTime: DurationStats;
    lineResolve: DurationStats;
  };
  rework: {
    rows: {
      section: string;
      orders: number;
      fileReplaced: number;
      layoutFixed: number;
      fileSwaps: number;
      dealerEdits: number;
      reworkOrders: number;
    }[];
  };
  cancellations: {
    deleted: number;
    cancelledByDealer: number;
    restored: number;
    byStage: { stage: string; deleted: number; cancelledByDealer: number }[];
  };
  load: {
    /** 7 × 24, Monday first, Chișinău hours. */
    heatmap: number[][];
    days: { day: string; orders: number; lines: number }[];
    sections: { section: string; orders: number; lines: number }[];
  };
  urgent: {
    orders: number;
    leadUrgent: DurationStats;
    leadNormal: DurationStats;
  };
  staff: { userId: string; name: string; role: string | null; statusChanges: number; lineChanges: number; flags: number }[];
}
