/**
 * Staff-side order notes limit (admin wizard, orders list, shop checkout note). The column is `text`;
 * a shop order with 30+ lines writes one row per line, so this is well above the customer-side 500.
 */
export const ORDER_STAFF_NOTES_MAX = 4000;
