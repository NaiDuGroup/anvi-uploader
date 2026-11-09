import { describe, expect, it } from "vitest";
import { shopCustomerStatus } from "./customerStatus";
import { buildShopOrderView } from "./orderView";

const base = { status: "NEW", paymentStatus: "pending", isPaid: false, shippedAt: null };

describe("shopCustomerStatus", () => {
  it("unpaid orders wait for payment", () => {
    expect(shopCustomerStatus(base)).toBe("pending_payment");
    expect(shopCustomerStatus({ ...base, paymentStatus: "failed" })).toBe("pending_payment");
    expect(shopCustomerStatus({ ...base, status: "IN_PROGRESS" })).toBe("pending_payment");
  });
  it("paid NEW → paid; further work → in_production", () => {
    const paid = { ...base, paymentStatus: "paid", isPaid: true };
    expect(shopCustomerStatus(paid)).toBe("paid");
    for (const s of ["IN_PROGRESS", "READY_IN_STUDIO", "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY", "RETURNED_TO_STUDIO"]) {
      expect(shopCustomerStatus({ ...paid, status: s })).toBe("in_production");
    }
  });
  it("staff-marked paid counts as paid", () => {
    expect(shopCustomerStatus({ ...base, isPaid: true })).toBe("paid");
  });
  it("shipped, delivered and issue", () => {
    const paid = { ...base, paymentStatus: "paid", isPaid: true };
    expect(shopCustomerStatus({ ...paid, status: "WORKSHOP_READY", shippedAt: new Date() })).toBe("shipped");
    expect(shopCustomerStatus({ ...paid, status: "DELIVERED", shippedAt: new Date() })).toBe("delivered");
    expect(shopCustomerStatus({ ...base, status: "DELIVERED" })).toBe("delivered");
    expect(shopCustomerStatus({ ...paid, status: "ISSUE" })).toBe("issue");
  });
  it("pay on delivery: never «awaiting payment» — accepted, then worked on and shipped unpaid", () => {
    const pod = { ...base, paymentProvider: "on_delivery" };
    expect(shopCustomerStatus(pod)).toBe("accepted");
    expect(shopCustomerStatus({ ...pod, status: "IN_PROGRESS" })).toBe("in_production");
    expect(shopCustomerStatus({ ...pod, status: "WORKSHOP_READY", shippedAt: new Date() })).toBe("shipped");
    expect(shopCustomerStatus({ ...pod, status: "DELIVERED" })).toBe("delivered");
    expect(shopCustomerStatus({ ...pod, paymentStatus: "paid", isPaid: true })).toBe("paid");
    // The switch on: an old online order is shown the same way.
    expect(shopCustomerStatus({ ...base, paymentProvider: "paynet", payOnDelivery: true })).toBe("accepted");
    expect(shopCustomerStatus({ ...base, paymentStatus: "failed", payOnDelivery: true })).toBe("accepted");
  });
});

describe("buildShopOrderView", () => {
  it("shows the courier address and note to the token holder (pickup: no address)", () => {
    const base = {
      orderNumber: 9,
      createdAt: new Date("2026-11-04T10:00:00Z"),
      status: "NEW",
      paymentStatus: "paid",
      isPaid: true,
      shippedAt: null,
      price: 145,
      deliveryPriceMdl: 45,
      deliveryCity: "Chișinău",
      deliveryAddress: "str. Ismail 1, ap. 5",
      deliveryNote: "sunați înainte",
      trackingNumber: null,
      customerName: "Ion",
      clientName: null,
      orderLines: [],
    };
    const courier = buildShopOrderView({ ...base, deliveryMethod: "courier_chisinau" });
    expect(courier.delivery).toEqual({
      method: "courier_chisinau",
      city: "Chișinău",
      address: "str. Ismail 1, ap. 5",
      note: "sunați înainte",
    });
    expect(JSON.stringify(courier)).not.toMatch(/phone|email/i);
    expect(buildShopOrderView({ ...base, deliveryMethod: "pickup" }).delivery.address).toBeUndefined();
  });

  it("exposes only the allowlisted fields", () => {
    const view = buildShopOrderView({
      orderNumber: 42,
      createdAt: new Date("2026-11-04T10:00:00Z"),
      status: "NEW",
      paymentStatus: "paid",
      isPaid: true,
      shippedAt: null,
      price: { toString: () => "345.00" },
      deliveryPriceMdl: { toString: () => "45.00" },
      deliveryMethod: "courier_chisinau",
      deliveryCity: "Chișinău",
      trackingNumber: null,
      customerName: "Ion",
      clientName: "Ion",
      orderLines: [
        { shopLineData: { title: "Cană", optionsText: "albă", quantity: 2, total: 300, quote: { kind: "mug" }, cost: 99 } },
        { shopLineData: null },
      ],
    });
    expect(view).toEqual({
      orderNumber: 42,
      createdAt: "2026-11-04T10:00:00.000Z",
      status: "paid",
      paymentStatus: "paid",
      total: 345,
      subtotal: 300,
      deliveryPrice: 45,
      discount: 0,
      delivery: { method: "courier_chisinau", city: "Chișinău" },
      customerName: "Ion",
      canPay: false,
      payOnDelivery: false,
      canAddFiles: true,
      lines: [{ title: "Cană", optionsText: "albă", quantity: 2, total: 300 }],
    });
  });

  it("offers payment while unpaid and names lines in the viewer's language when it can", () => {
    const view = buildShopOrderView(
      {
        orderNumber: 7,
        createdAt: new Date("2026-11-04T10:00:00Z"),
        status: "NEW",
        paymentStatus: "pending",
        isPaid: false,
        shippedAt: null,
        price: 150,
        deliveryPriceMdl: 0,
        deliveryMethod: "pickup",
        deliveryCity: null,
        trackingNumber: null,
        customerName: "Ana",
        clientName: null,
        orderLines: [
          { shopLineData: { title: "Cană albă", optionsText: "320 ml", quantity: 1, total: 150, quote: { kind: "mug", productId: "v1" } } },
          { shopLineData: { title: "Pix", quantity: 1, total: 100, quote: { kind: "pen", productId: "gone" } } },
        ],
      },
      (q) => ((q as { productId?: string }).productId === "v1" ? { title: "Белая кружка", optionsText: "320 мл" } : null),
    );
    expect(view.canPay).toBe(true);
    expect(view.payOnDelivery).toBe(false);
    expect(view.status).toBe("pending_payment");
    expect(view.lines.map((l) => [l.title, l.optionsText])).toEqual([
      ["Белая кружка", "320 мл"],
      ["Pix", undefined],
    ]);
  });

  it("pay on delivery: no «Plătește», marked payOnDelivery until paid", () => {
    const o = {
      orderNumber: 8,
      createdAt: new Date("2026-11-09T10:00:00Z"),
      status: "NEW",
      paymentStatus: "pending",
      paymentProvider: "on_delivery",
      isPaid: false,
      shippedAt: null,
      price: 150,
      deliveryPriceMdl: 0,
      deliveryMethod: "pickup",
      deliveryCity: null,
      trackingNumber: null,
      customerName: "Ana",
      clientName: null,
      orderLines: [],
    };
    const view = buildShopOrderView(o);
    expect(view).toMatchObject({ status: "accepted", canPay: false, payOnDelivery: true });
    expect(buildShopOrderView({ ...o, paymentStatus: "paid", isPaid: true })).toMatchObject({ status: "paid", payOnDelivery: false });
    // Switch on: an unpaid Paynet order is not offered online payment either.
    expect(buildShopOrderView({ ...o, paymentProvider: "paynet", payOnDelivery: true })).toMatchObject({ canPay: false, payOnDelivery: true });
    expect(buildShopOrderView({ ...o, paymentProvider: "paynet" })).toMatchObject({ canPay: true, payOnDelivery: false });
  });
});
