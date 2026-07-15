import type { EFacturaClient } from "./types";
import { createMockEFacturaClient } from "./mockClient";
import { createSoapEFacturaClient } from "./soapClient";

export * from "./types";
export { createMockEFacturaClient } from "./mockClient";
export { createSoapEFacturaClient } from "./soapClient";

/**
 * Returns the configured e-Factura client. Falls back to the mock unless real
 * SOAP credentials are present in the environment:
 *   EFACTURA_MODE=live
 *   EFACTURA_USERNAME / EFACTURA_PASSWORD   (the dedicated API user)
 *   EFACTURA_ENDPOINT  (optional; defaults to https://efactura-api.sfs.md/Service.svc)
 */
export function getEFacturaClient(): EFacturaClient {
  const mode = process.env.EFACTURA_MODE;
  const endpoint = process.env.EFACTURA_ENDPOINT;
  const username = process.env.EFACTURA_USERNAME;
  const password = process.env.EFACTURA_PASSWORD;

  if (mode === "live" && username && password) {
    return createSoapEFacturaClient({ endpoint, username, password });
  }
  return createMockEFacturaClient();
}

/** True when a real e-Factura connection is configured. */
export function isEFacturaLive(): boolean {
  return (
    process.env.EFACTURA_MODE === "live" &&
    !!process.env.EFACTURA_USERNAME &&
    !!process.env.EFACTURA_PASSWORD
  );
}
