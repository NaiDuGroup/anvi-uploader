import { describe, expect, it } from "vitest";
import { parseInvoiceXml } from "./parseInvoiceXml";

describe("parseInvoiceXml receipt settlement", () => {
  it("reads bon fiscal from <Notes> when AttachedDocuments is empty", () => {
    const xml = `
      <Document>
        <SupplierInfo><Seria>EAW</Seria><Number>000035499</Number>
          <IssuedDate>2025-03-17T00:00:00</IssuedDate></SupplierInfo>
        <Supplier IDNO="1023600000396" Title="ANVI-STUDIO GROUP S.R.L."/>
        <Buyer IDNO="1020600029699" Title="INOVA SOLUTIONS S.R.L."/>
        <Notes>bon fiscal 0006 din 06.03.2025 (card)</Notes>
        <AttachedDocuments></AttachedDocuments>
        <VehicleLogbook><Seria/><Number/></VehicleLogbook>
        <Total>110.00</Total><TotalTVA>18.33</TotalTVA>
      </Document>
    `;
    const parsed = parseInvoiceXml(xml);
    expect(parsed.receiptRef).toBe("bon fiscal 0006 din 06.03.2025 (card)");
    expect(parsed.settledByReceipt).toBe(true);
    expect(parsed.receiptMethod).toBe("card");
    expect(parsed.receiptDate?.slice(0, 10)).toBe("2025-03-06");
  });

  it("prefers AttachedDocuments over Notes", () => {
    const xml = `
      <Document>
        <SupplierInfo><Seria>EBJ</Seria><Number>000000001</Number></SupplierInfo>
        <Notes>ignored note text</Notes>
        <AttachedDocuments>b/f 0013 din 09.07.2026 (card)</AttachedDocuments>
        <Total>100</Total>
      </Document>
    `;
    const parsed = parseInvoiceXml(xml);
    expect(parsed.receiptRef).toBe("b/f 0013 din 09.07.2026 (card)");
    expect(parsed.settledByReceipt).toBe(true);
    expect(parsed.receiptMethod).toBe("card");
  });
});
