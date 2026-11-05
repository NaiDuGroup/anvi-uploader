import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ru } from "@/lib/i18n/ru";
import { ro } from "@/lib/i18n/ro";
import { ServerLocaleProvider, serverLanguageSnapshot, useLanguageStore } from "./useLanguageStore";

function Probe() {
  const { locale } = useLanguageStore();
  const t = useLanguageStore((s) => s.t);
  return createElement("p", null, `${locale}|${t.admin === ru.admin ? "ru" : t.admin === ro.admin ? "ro" : "?"}`);
}

describe("useLanguageStore server render", () => {
  it("renders the request's cookie locale (no Romanian first paint for Russian users)", () => {
    const html = renderToStaticMarkup(createElement(ServerLocaleProvider, { locale: "ru" }, createElement(Probe)));
    expect(html).toBe("<p>ru|ru</p>");
  });

  it("ignores the shared module store on the server (another request's locale cannot leak)", () => {
    useLanguageStore.setState({ locale: "en" });
    try {
      const html = renderToStaticMarkup(createElement(ServerLocaleProvider, { locale: "ru" }, createElement(Probe)));
      expect(html).toBe("<p>ru|ru</p>");
    } finally {
      useLanguageStore.setState({ locale: "ro" });
    }
  });

  it("falls back to the default (Romanian) when there is no cookie", () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<p>ro|ro</p>");
    expect(renderToStaticMarkup(createElement(ServerLocaleProvider, { locale: null }, createElement(Probe)))).toBe("<p>ro|ro</p>");
  });

  it("keeps one stable snapshot per locale", () => {
    expect(serverLanguageSnapshot("ru")).toBe(serverLanguageSnapshot("ru"));
    expect(serverLanguageSnapshot("ru").hydrated).toBe(true);
    expect(serverLanguageSnapshot(null)).toBe(useLanguageStore.getInitialState());
  });
});
