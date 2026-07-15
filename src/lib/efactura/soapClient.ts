import { EFACTURA_ROLE, type EFacturaClient, type EFacturaInvoice } from "./types";
import { parseInvoiceXml } from "./parseInvoiceXml";

/**
 * Real e-Factura (SFS Moldova) client.
 *
 * Verified against the official WSDL at
 *   https://efactura-api.sfs.md/Service.svc?singleWsdl
 * The service is a WCF `basicHttpBinding` endpoint with
 * `TransportWithMessageCredential` security: HTTPS transport + a WS-Security
 * UsernameToken (plaintext password) in the SOAP header. The contract namespace
 * is `http://tempuri.org/` (interface `IService`) and data contracts live in
 * `http://schemas.datacontract.org/2004/07/AX.EFactura.Model.ApiModel`.
 *
 * NOTE ON DATA COMPLETENESS: `GetAcceptedInvoices` and `SearchInvoices` only
 * return invoice identity (Seria, Number, InvoiceStatus) — NOT buyer IDNO or
 * amounts. Those come from the per-invoice XML via `GetInvoicesBySeriaNumber`.
 * `SearchInvoices` CAN filter by InvoiceStatus (7 Sent / 8 Signed buyer), so we
 * use it to discover portal «Отправлено» / «Завершённые» that the Accepted queue
 * often does not list. Portal CSV remains a rare backfill if Search is sparse.
 */

const DEFAULT_ENDPOINT = "https://efactura-api.sfs.md/Service.svc";
const CONTRACT_NS = "http://tempuri.org/";
const DATA_NS = "http://schemas.datacontract.org/2004/07/AX.EFactura.Model.ApiModel";
const WSSE_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const WSSE_PASSWORD_TYPE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";

export interface EFacturaSoapConfig {
  endpoint?: string;
  username: string;
  password: string;
  /** Supplier | Buyer | Carrier. Defaults to Supplier (our issued invoices). */
  actorRole?: number;
  /** Per-request timeout (ms). The SFS server throttles heavy/rapid callers. */
  timeoutMs?: number;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Extracts inner text of every `<tag>..</tag>`, tolerating XML namespaces. */
function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`,
    "g",
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function extractOne(xml: string, tag: string): string | null {
  const all = extractAll(xml, tag);
  return all.length > 0 ? all[0].trim() : null;
}

/** Decodes the double-encoded invoice document carried in `<a:Xml>`. */
function decodeXmlPayload(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function createSoapEFacturaClient(
  config: EFacturaSoapConfig,
): EFacturaClient {
  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  const actorRole = config.actorRole ?? EFACTURA_ROLE.SUPPLIER;
  const timeoutMs = config.timeoutMs ?? 25_000;

  async function call(operation: string, requestBodyXml: string): Promise<string> {
    const requestId = `anvi-${Date.now()}`;
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="${CONTRACT_NS}" xmlns:d="${DATA_NS}">
  <s:Header>
    <o:Security s:mustUnderstand="1" xmlns:o="${WSSE_NS}">
      <o:UsernameToken>
        <o:Username>${xmlEscape(config.username)}</o:Username>
        <o:Password Type="${WSSE_PASSWORD_TYPE}">${xmlEscape(config.password)}</o:Password>
      </o:UsernameToken>
    </o:Security>
  </s:Header>
  <s:Body>
    <t:${operation}>
      <t:request>
        <d:RequestId>${requestId}</d:RequestId>
        ${requestBodyXml}
      </t:request>
    </t:${operation}>
  </s:Body>
</s:Envelope>`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `${CONTRACT_NS}IService/${operation}`,
        },
        body: envelope,
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    if (!res.ok) {
      const fault =
        extractOne(text, "faultstring") ?? extractOne(text, "Text") ?? "";
      throw new Error(
        `e-Factura ${operation} failed: HTTP ${res.status}${fault ? ` — ${fault}` : ""}`,
      );
    }
    return text;
  }

  function parseInvoiceIdentityBlocks(
    blocks: string[],
    options?: { trustTimeStampAsIssueDate?: boolean },
  ): EFacturaInvoice[] {
    const out: EFacturaInvoice[] = [];
    for (const block of blocks) {
      const seria = extractOne(block, "Seria") ?? "";
      const number = extractOne(block, "Number") ?? "";
      if (!seria || !number) continue;
      const statusRaw = extractOne(block, "InvoiceStatus");
      const status = statusRaw != null ? Number(statusRaw) : 0;
      out.push({
        seria,
        number,
        status: Number.isFinite(status) ? status : 0,
        // List endpoints often put response time in TimeStamp — only trust it
        // when the caller knows the field is meaningful (Accepted queue).
        issueDate: options?.trustTimeStampAsIssueDate
          ? extractOne(block, "TimeStamp")
          : null,
        totalAmount: null,
        vatAmount: null,
        currency: "MDL",
        buyerName: null,
        buyerIdno: null,
        raw: block,
      });
    }
    return out;
  }

  function toDateTime(d: Date): string {
    // WCF dateTime; keep local-naive form the service accepts.
    return d.toISOString().replace("Z", "");
  }

  async function listSupplierInvoices(): Promise<EFacturaInvoice[]> {
    // GetAcceptedInvoices(ActorBaseRequest): InvoicesResponse
    const xml = await call(
      "GetAcceptedInvoices",
      `<d:ActorRole>${actorRole}</d:ActorRole>`,
    );

    // Peel to the result payload, then split into <Invoice> blocks.
    const result = extractOne(xml, "GetAcceptedInvoicesResult") ?? xml;
    const results = extractOne(result, "Results") ?? result;
    const blocks = extractAll(results, "Invoice");
    return parseInvoiceIdentityBlocks(blocks, { trustTimeStampAsIssueDate: true });
  }

  async function searchInvoices(options: {
    invoiceStatus: number;
    issuedFrom?: Date;
    issuedTo?: Date;
  }): Promise<EFacturaInvoice[]> {
    // SearchInvoices(SearchRequest): InvoicesResponse — identity only, but
    // filterable by InvoiceStatus (portal Sent=7 / Completed≈8).
    const issuedOn =
      options.issuedFrom || options.issuedTo
        ? `<d:IssuedOn>` +
          (options.issuedFrom
            ? `<d:StartDate>${toDateTime(options.issuedFrom)}</d:StartDate>`
            : "") +
          (options.issuedTo
            ? `<d:EndDate>${toDateTime(options.issuedTo)}</d:EndDate>`
            : "") +
          `</d:IssuedOn>`
        : "";

    const xml = await call(
      "SearchInvoices",
      `<d:ActorRole>${actorRole}</d:ActorRole>` +
        `<d:Parameters>` +
        `<d:InvoiceStatus>${options.invoiceStatus}</d:InvoiceStatus>` +
        issuedOn +
        `</d:Parameters>`,
    );

    const result = extractOne(xml, "SearchInvoicesResult") ?? xml;
    const results = extractOne(result, "Results") ?? result;
    const blocks = extractAll(results, "Invoice");
    return parseInvoiceIdentityBlocks(blocks);
  }

  async function getInvoiceBySeriaNumber(
    seria: string,
    number: string,
  ): Promise<EFacturaInvoice | null> {
    // GetInvoicesBySeriaNumber(InvoicesRequest): InvoicesXmlResponse
    const xml = await call(
      "GetInvoicesBySeriaNumber",
      `<d:SeriaAndNumbers><d:InvoiceIndentificator>` +
        `<d:Number>${xmlEscape(number)}</d:Number>` +
        `<d:Seria>${xmlEscape(seria)}</d:Seria>` +
        `</d:InvoiceIndentificator></d:SeriaAndNumbers>`,
    );

    const block = extractOne(xml, "XmlInvoice");
    if (!block) return null;
    // When the invoice is not accessible the service echoes the query back with
    // a "Message" like "Invoice not found!" and NO <Xml> document. Treat that as
    // a miss so callers don't persist an empty phantom record.
    const docRaw = extractOne(block, "Xml");
    if (!docRaw) return null;
    const statusRaw = extractOne(block, "InvoiceStatus");
    const status = statusRaw != null ? Number(statusRaw) : 0;
    const doc = decodeXmlPayload(docRaw);
    const parsed = doc ? parseInvoiceXml(doc) : null;

    return {
      seria: parsed?.seria ?? extractOne(block, "Seria") ?? seria,
      number: parsed?.number ?? extractOne(block, "Number") ?? number,
      status: Number.isFinite(status) ? status : 0,
      issueDate: parsed?.issueDate ?? null,
      totalAmount: parsed?.totalAmount ?? null,
      vatAmount: parsed?.vatAmount ?? null,
      currency: "MDL",
      buyerName: parsed?.buyerName ?? null,
      buyerIdno: parsed?.buyerIdno ?? null,
      receiptRef: parsed?.receiptRef ?? null,
      settledByReceipt: parsed?.settledByReceipt ?? false,
      receiptMethod: parsed?.receiptMethod ?? null,
      receiptDate: parsed?.receiptDate ?? null,
      redirections: parsed?.redirections ?? null,
      raw: doc || block,
    } satisfies EFacturaInvoice;
  }

  async function listArchivedInvoices(options?: {
    issuedFrom?: Date;
    issuedTo?: Date;
  }): Promise<EFacturaInvoice[]> {
    // ArchivedRequest: { ActorRole, IssuedOn?{StartDate,EndDate}, Page }.
    // IMPORTANT: the service 500s on Page=0 and on a bare EndDate; pages are
    // 1-indexed. We loop pages until a page returns no invoices.
    const out: EFacturaInvoice[] = [];
    const seen = new Set<string>();
    const issuedOn =
      options?.issuedFrom || options?.issuedTo
        ? `<d:IssuedOn>` +
          (options?.issuedTo
            ? `<d:EndDate>${toDateTime(options.issuedTo)}</d:EndDate>`
            : "") +
          (options?.issuedFrom
            ? `<d:StartDate>${toDateTime(options.issuedFrom)}</d:StartDate>`
            : "") +
          `</d:IssuedOn>`
        : "";

    for (let page = 1; page <= 200; page++) {
      const xml = await call(
        "GetArchivedInvoices",
        `<d:ActorRole>${actorRole}</d:ActorRole>${issuedOn}<d:Page>${page}</d:Page>`,
      );
      const result = extractOne(xml, "GetArchivedInvoicesResult") ?? xml;
      const results = extractOne(result, "Results") ?? result;
      const blocks = extractAll(results, "Invoice");
      if (blocks.length === 0) break;

      let added = 0;
      for (const inv of parseInvoiceIdentityBlocks(blocks)) {
        const key = `${inv.seria}/${inv.number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        added++;
        out.push(inv);
      }
      // A page with only duplicates means the service ignores paging for this
      // query (single-page result) — stop to avoid an infinite loop.
      if (added === 0) break;
    }
    return out;
  }

  return {
    listSupplierInvoices,
    getInvoiceBySeriaNumber,
    listArchivedInvoices,
    searchInvoices,
  };
}
