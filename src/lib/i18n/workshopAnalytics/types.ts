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
  /** Tag on statuses that only wait for the client to pick up. */
  waitingClient: string;
  noLineData: string;

  fileHeading: string;
  fileNote: string;
  problemsFile: string;
  problemsFileHint: string;
  problemsOther: string;
  problemsOtherHint: string;
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
  /** Daily chart tooltip: «12 авг.: заказов 39, позиций 66». */
  dayTooltip: (day: string, orders: number, lines: number) => string;
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
  unknownUser: string;
  colStatusChanges: string;
  colLineChanges: string;
  colFlags: string;
};
