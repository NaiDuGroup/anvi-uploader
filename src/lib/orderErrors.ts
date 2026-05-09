/** Thrown when creating or restoring an order would exceed mug stock. */
export class InsufficientStockOrderError extends Error {
  readonly code = "insufficient_stock" as const;

  constructor(
    public readonly requested: number,
    public readonly available: number,
  ) {
    super("insufficient_stock");
    this.name = "InsufficientStockOrderError";
  }
}
