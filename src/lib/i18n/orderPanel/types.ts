/** «Весь заказ» side panel on the workshop board (`OrderOverviewDrawer`). */
export interface OrderPanelDictionary {
  /** Tooltip of the line code button on a board card. */
  openWholeOrder: string;
  title: (orderNumber: string) => string;
  close: string;
  loading: string;
  loadFailed: string;
  retry: string;
  createdAt: string;
  createdBy: string;
  sentBy: string;
  /** Creator unknown: the client made it (cabinet / site). */
  byClient: string;
  urgent: string;
  orderStatus: string;
  issue: string;
  price: string;
  paid: string;
  unpaid: string;
  linesTitle: (count: number) => string;
  /** Badge on the line the panel was opened from. */
  openedFromHere: string;
  notOnBoard: string;
  noFiles: string;
  notes: string;
  noNotes: string;
  comments: (count: number) => string;
  openComments: string;
  history: string;
  noHistory: string;
  /** The panel shows only the newest entries. */
  historyLatest: (count: number) => string;
  showOnBoard: string;
  someOnBoard: (onBoard: number, total: number) => string;
  noneOnBoard: string;
  edit: string;
  openInList: string;
  /** Opens in a new tab (title of the link buttons). */
  newTab: string;
}
