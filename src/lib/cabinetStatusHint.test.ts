import { describe, expect, it } from "vitest";
import { ru } from "@/lib/i18n/ru";
import { ro } from "@/lib/i18n/ro";
import { dealerModifyBlockReason, dealerOrderActionsState } from "@/lib/dealerOrderModify";
import { getCabinetVisibleStatus } from "@/lib/validations";
import { cabinetStatusHint } from "./cabinetStatusHint";

/** Hint as the cabinet order page computes it for a dealer / retail client. */
function hint(status: string, opts: { dealer?: boolean; isPaid?: boolean; studioAddress?: string | null } = {}) {
  const order = { status, isPaid: opts.isPaid ?? false, cancelledAt: null };
  return cabinetStatusHint(
    {
      status: getCabinetVisibleStatus(order),
      dealerActions: opts.dealer ? dealerOrderActionsState(order) : "hidden",
      dealerLockReason: opts.dealer ? dealerModifyBlockReason(order) : null,
      studioAddress: opts.studioAddress,
    },
    ru,
  );
}

describe("cabinetStatusHint", () => {
  it("dealer, unpaid: edit / cancel is offered until printing starts", () => {
    expect(hint("NEW", { dealer: true })).toBe("Проверяем файлы. Пока можно изменить или отменить.");
    expect(hint("IN_PROGRESS", { dealer: true })).toBe("Проверяем файлы. Пока можно изменить или отменить.");
    expect(hint("SENT_TO_WORKSHOP", { dealer: true })).toBe("Пока можно изменить или отменить.");
    expect(hint("WORKSHOP_PRINTING", { dealer: true })).toBe(
      "Товар, количество и цену изменить уже нельзя. Если что-то не так, напишите цеху.",
    );
  });

  it("dealer, paid: no edit sentence (the bar's «already paid» plaque explains it)", () => {
    expect(hint("NEW", { dealer: true, isPaid: true })).toBe("Проверяем файлы.");
    expect(hint("SENT_TO_WORKSHOP", { dealer: true, isPaid: true })).toBeNull();
  });

  it("retail client: never an edit hint", () => {
    expect(hint("NEW")).toBe("Проверяем файлы.");
    expect(hint("SENT_TO_WORKSHOP")).toBeNull();
    expect(hint("WORKSHOP_PRINTING")).toBeNull();
    expect(hint("ISSUE")).toBeNull();
  });

  it("pickup states show an address only when one is known", () => {
    expect(hint("READY_IN_STUDIO", { studioAddress: "str. Alba-Iulia 77/18, Chișinău" })).toBe(
      "Адрес: str. Alba-Iulia 77/18, Chișinău",
    );
    expect(hint("RETURNED_TO_STUDIO", { studioAddress: "  " })).toBeNull();
    expect(hint("WORKSHOP_READY", { dealer: true })).toBeNull();
  });

  it("delivered and cancelled", () => {
    expect(hint("DELIVERED", { dealer: true })).toBe("Заказ получен.");
    expect(cabinetStatusHint({ status: "cancelled" }, ru)).toBeNull();
  });

  it("has Romanian texts", () => {
    expect(cabinetStatusHint({ status: "accepted", dealerActions: "editable" }, ro)).toBe(
      "Verificăm fișierele. Încă se poate modifica sau anula.",
    );
  });
});
