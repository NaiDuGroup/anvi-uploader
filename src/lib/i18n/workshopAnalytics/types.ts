/** Admin «Аналитика цеха» (super admin): texts of the page. */
export type WorkshopAnalyticsDictionary = {
  nav: string;
  title: string;
  intro: string;
  dataNote: (orderLogSince: string | null, lineStatusSince: string | null) => string;
  preset7: string;
  preset30: string;
  preset90: string;
  excludeTest: string;
  excludeTestHint: string;
  loading: string;
  loadError: string;
  noData: string;
  durUnits: { d: string; h: string; m: string };
  sectionMixed: string;
  median: string;
  p90: string;
  count: string;
  share: string;

  kpiCreated: string;
  kpiDelivered: string;
  kpiDeliveredHint: string;
  kpiProblems: string;
  kpiProblemsHint: string;
  kpiUrgent: string;
  kpiLead: string;
  kpiLeadHint: string;
  kpiReady: string;
  kpiReadyHint: string;

  statusTimeHeading: string;
  statusTimeNote: string;
  orderLevel: string;
  lineLevel: string;
  allSections: string;
  colStatus: string;
  slowest: string;
  noLineData: string;

  fileHeading: string;
  fileNote: string;
  issueOrders: string;
  flaggedOrders: string;
  lineFlags: string;
  issueTime: string;
  lineResolve: string;
  byDealer: string;
  bySection: string;
  byReason: string;
  reasonSourceOrder: string;
  reasonSourceLine: string;
  customTexts: string;
  colDealer: string;
  colOrders: string;
  colProblems: string;
  colSection: string;
  colReason: string;
  colSource: string;

  reworkHeading: string;
  reworkNote: string;
  colReplaced: string;
  colLayoutFixed: string;
  colSwaps: string;
  colDealerEdits: string;
  colReworkOrders: string;

  cancelHeading: string;
  cancelNote: string;
  deletedByStaff: string;
  cancelledByDealer: string;
  restored: string;
  colStage: string;

  loadHeading: string;
  loadNote: string;
  heatmapTitle: string;
  weekdays: readonly [string, string, string, string, string, string, string];
  perDayTitle: string;
  ordersLegend: string;
  linesLegend: string;
  sectionsTitle: string;
  colLines: string;
  colPerDay: string;

  urgentHeading: string;
  urgentShare: string;
  leadUrgent: string;
  leadNormal: string;
  urgentNote: string;

  staffHeading: string;
  staffNote: string;
  colUser: string;
  colStatusChanges: string;
  colLineChanges: string;
  colFlags: string;
};
