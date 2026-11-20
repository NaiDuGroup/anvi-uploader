"use client";

import { createContext, useContext } from "react";

/** «Показать на доске»: cards of this order get a ring + pulse; `nonce` re-triggers expand/scroll. */
export interface BoardOrderHighlight {
  orderId: string;
  nonce: number;
}

export interface BoardOrderPanelApi {
  /** Opens the «Весь заказ» panel from a board card. */
  openOrder: (orderId: string, orderLineId: string) => void;
  highlight: BoardOrderHighlight | null;
}

export const BoardOrderPanelContext = createContext<BoardOrderPanelApi>({
  openOrder: () => {},
  highlight: null,
});

export function useBoardOrderPanel(): BoardOrderPanelApi {
  return useContext(BoardOrderPanelContext);
}

/** How long the cards of a «Показать на доске» order stay highlighted. */
export const BOARD_HIGHLIGHT_MS = 4000;
