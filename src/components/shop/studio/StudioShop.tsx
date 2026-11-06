"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CartLine } from "@/lib/storefront/cart";
import { useCart, useHydrated } from "@/lib/storefront/cartStore";
import { studioEditorPath } from "@/lib/storefront/design";
import { formatPrice } from "@/lib/storefront/format";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import type { ShopProduct } from "@/lib/storefront/types";
import { adaptStudioDoc } from "@/lib/studio/adapt";
import { emptyStudioDoc, studioId, type StudioDoc, type StudioKind } from "@/lib/studio/document";
import { loadStudioFields } from "@/lib/studio/fieldsStore";
import { studioPenT } from "@/lib/studio/i18n.pen";
import { studioShopT } from "@/lib/studio/i18n.shop";
import { studioStartT } from "@/lib/studio/i18n.start";
import { isPenFormDoc } from "@/lib/studio/penForm";
import { isStudioCartLine, studioLineQuantity, studioQuoteLine } from "@/lib/studio/productLine";
import type { StudioStarter } from "@/lib/studio/personalise";
import { STUDIO_COLOR_FIELD_KEYS, fieldsFromDoc, type StudioFields } from "@/lib/studio/smartFields";
import { deleteDoc, listDocs, loadDoc, resumableDrafts, saveDoc, type StoredStudioDoc } from "@/lib/studio/storage";
import { initialSurfaceBases, printOfItem, studioSurfaces } from "@/lib/studio/surfaces";
import { cardQuoteLine } from "@/lib/studio/cardLine";
import { cardShortStart, parseCardShortState, type CardShortState } from "@/lib/studio/cardFlow";
import { cardShortDocMeasured } from "@/lib/studio/cardFlowClient";
import { CARD_FRONT_ID } from "@/lib/studio/surfaces";
import { studioCardT } from "@/lib/studio/i18n.card";
import { SHOP_BC_DEFAULT_PACK } from "@/lib/storefront/businessCards";
import { StudioCardSideBar, StudioCardVerify, cardWithFields } from "./StudioCard";
import { StudioCardStart } from "./StudioCardGallery";
import { StudioCardShort } from "./StudioCardShort";
import { useShopLang } from "../ShopLangProvider";
import { StudioApp, type StudioCatalogItem, type StudioEditorApi, type StudioExtensions } from "./StudioApp";
import { StudioCrossSell, type StudioCrossSellTarget } from "./StudioCrossSell";
import { StudioMyDataPanel } from "./StudioMyData";
import { StudioPenForm } from "./StudioPenForm";
import { StudioPersonalise } from "./StudioPersonalise";
import { StudioPreviewDock } from "./StudioPreviewDock";
import { StudioLivePicture, useStableAssets, useStudioProductLook } from "./StudioProductPicture";
import { StudioQualityChip, StudioQualityDialog, StudioQualityList, useStudioQuality } from "./StudioQuality";
import { StudioStartScreen, StudioTemplatesPanel } from "./StudioStart";
import { Icon, STUDIO_ICONS } from "./StudioUi";
import { StudioVerifyScreen } from "./StudioVerify";

/** Another product the design can go on (cross-sell), picked on the server from the catalog. */
export interface StudioCrossSellProduct {
  kind: StudioKind;
  slug: string;
  name: string;
  /** Variant ids, in-stock ones first (print area of the first known one). */
  variantIds: string[];
  /** Lowest catalog price per piece (display only; the cart quotes the real one). */
  price: number | null;
}

/** `form`: pens open as a form (Pens.com style); `personalise`: the short form after a template. */
/** `cardShort`: business cards, «Editare rapidă» after a gallery pick. */
type Phase = "loading" | "resume" | "start" | "personalise" | "form" | "cardShort" | "edit" | "verify" | "done";

/**
 * ANVI Studio in the shop: the editor (`StudioApp`) with the start screen,
 * templates, «Datele mele», the quality traffic light, «Verifică designul»,
 * the cart line, autosave and «Designul tău pe alte produse».
 */
export function StudioShop(props: {
  kind: StudioKind;
  product: ShopProduct;
  variantId: string | null;
  editId: string | null;
  fromId: string | null;
  forceNew: boolean;
  fromEdit?: boolean;
  crossSell: StudioCrossSellProduct[];
}) {
  const lines = useCart();
  const hydrated = useHydrated();
  const { t: shopT } = useShopLang();
  if (!hydrated) {
    return (
      <p className="m-0 py-16 text-center text-(--muted2)" aria-busy="true">
        {shopT("editorLoading")}
      </p>
    );
  }
  const editLine: CartLine | null = props.editId
    ? (lines.find((l) => l.id === props.editId && isStudioCartLine(l, props.kind)) ?? null)
    : null;
  return <StudioShopBody key={editLine?.id ?? props.fromId ?? "new"} {...props} editLine={editLine} cartDocIds={lines.map((l) => l.design?.studio?.docId).filter((x): x is string => !!x)} />;
}

function StudioShopBody({
  kind,
  product,
  variantId,
  fromId,
  forceNew,
  fromEdit = false,
  crossSell,
  editLine,
  cartDocIds,
}: {
  kind: StudioKind;
  product: ShopProduct;
  variantId: string | null;
  fromId: string | null;
  forceNew: boolean;
  fromEdit?: boolean;
  crossSell: StudioCrossSellProduct[];
  editLine: CartLine | null;
  cartDocIds: string[];
}) {
  const { lang, href } = useShopLang();
  const t = studioShopT(lang);
  const router = useRouter();
  const [phase, setPhaseState] = useState<Phase>("loading");
  // The ref changes with the phase at once: the editor's document-change effect
  // (a child effect, it runs before ours) must see «personalise» when picking a
  // template sets both — else that first design was never autosaved.
  const phaseRef = useRef<Phase>(phase);
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const [note, setNote] = useState<string | null>(editLine ? t("editingLine") : null);
  // Pen form: chosen quantity (goes to the verify step), signature of the last document it wrote, came to verify from it.
  const isPen: boolean = kind === "pen";
  const isCard: boolean = kind === "card";
  const [penQty, setPenQty] = useState<number>(editLine ? studioLineQuantity(editLine.quote) : 1);
  const penSig = useRef<string | null>(null);
  const [fromForm, setFromForm] = useState(false);
  const startPhase: Phase = isPen ? "form" : "start";
  const [fields, setFields] = useState<StudioFields>({});
  // Studio v2: photos and name from the start screen; where «Înapoi» on the verify step goes.
  const [starter, setStarter] = useState<StudioStarter>({ photos: [], name: "" });
  const [verifyBack, setVerifyBack] = useState<"edit" | "personalise">("edit");
  // Business cards: the short edit's picks (null once the full editor owns the card) and the start screen's step.
  const [cardShort, setCardShortState] = useState<CardShortState | null>(null);
  const cardShortRef = useRef<CardShortState | null>(null);
  const setCardShort = useCallback((s: CardShortState | null) => {
    cardShortRef.current = s;
    setCardShortState(s);
  }, []);
  const [cardStartStep, setCardStartStep] = useState<"details" | "gallery">("details");

  // Business cards: the browser / phone «back» steps back through the flow (gallery ← short edit ← verify)
  // instead of leaving the Studio. One history entry per step deeper (same URL); the full editor counts as
  // the bottom (back from it leaves, as before — its work is in the draft).
  const cardDepth = useRef(0);
  const cardPopsToIgnore = useRef(0);
  const depthOf = useCallback((p: Phase): number => (p === "cardShort" ? 1 : p === "verify" ? (cardShortRef.current ? 2 : 1) : 0), []);
  useEffect(() => {
    if (!isCard) return;
    const d: number = depthOf(phase);
    for (let i = cardDepth.current; i < d; i++) window.history.pushState({ ...window.history.state, studioCardStep: i + 1 }, "");
    // Stepped back with the page's own buttons: the extra entries go too (no dead «back» presses later).
    if (d < cardDepth.current) {
      cardPopsToIgnore.current += 1;
      window.history.go(d - cardDepth.current);
    }
    cardDepth.current = d;
  }, [isCard, phase, depthOf]);
  useEffect(() => {
    if (!isCard) return;
    const onPop = () => {
      if (cardPopsToIgnore.current > 0) {
        cardPopsToIgnore.current -= 1;
        return;
      }
      const p: Phase = phaseRef.current;
      const d: number = depthOf(p);
      if (d === 0) return;
      cardDepth.current = d - 1;
      if (p === "verify") {
        setNote(null);
        setPhase(cardShortRef.current ? "cardShort" : "edit");
      } else if (p === "cardShort") {
        setCardStartStep("gallery");
        setPhase("start");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isCard, depthOf, setPhase]);
  useEffect(() => {
    let cancelled = false;
    void loadStudioFields().then((r) => !cancelled && setFields((cur) => ({ ...r.fields, ...cur })));
    return () => {
      cancelled = true;
    };
  }, []);

  // Step of the draft offered on «Continui designul început?» (back to «Personalizează» when it was saved there).
  const resumeStep = useRef<StoredStudioDoc["step"]>(null);
  const resumeShort = useRef<CardShortState | null>(null);

  // ─── Autosave ────────────────────────────────────────────────────────
  const [saveState, setSaveStateRaw] = useState<"idle" | "saving" | "saved">("idle");
  // Set only when it changes: `onDocChange` runs in an effect after every keystroke,
  // and even a same-value setState there queues a render (fast typing then never settled).
  const saveStateRef = useRef(saveState);
  const setSaveState = useCallback((s: "idle" | "saving" | "saved") => {
    if (saveStateRef.current === s) return;
    saveStateRef.current = s;
    setSaveStateRaw(s);
  }, []);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current != null && window.clearTimeout(timer.current)), []);
  const onDocChange = (doc: StudioDoc, api: StudioEditorApi) => {
    const p = phaseRef.current;
    if (p !== "edit" && p !== "verify" && p !== "form" && p !== "personalise" && p !== "cardShort") return;
    if (!doc.surfaces.some((s) => s.layers.length > 0)) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = window.setTimeout(() => {
      // A card still in the short edit keeps its picks (resume goes back there; verify too, while they last).
      const short: CardShortState | null = isCard && (p === "cardShort" || p === "verify") ? cardShortRef.current : null;
      void saveDoc({ id: doc.id, kind, doc, slug: product.slug, variantId: api.variant?.id ?? null, step: short && p === "verify" ? "cardShort" : p, ...(short ? { cardShort: short } : {}) }).then(() =>
        setSaveState("saved"),
      );
    }, 800);
  };

  // ─── Cross-sell targets: print area of each product's first known variant ─
  const [targets, setTargets] = useState<StudioCrossSellTarget[]>([]);
  useEffect(() => {
    if (phase !== "done" || targets.length || crossSell.length === 0) return;
    let cancelled = false;
    void Promise.all(
      crossSell.map(async (p): Promise<StudioCrossSellTarget> => {
        let item: StudioCatalogItem | null = null;
        try {
          const r = await fetch(`/api/${p.kind}-products`);
          const d = (r.ok ? await r.json() : { items: [] }) as { items?: StudioCatalogItem[] };
          item = p.variantIds.map((id) => d.items?.find((i) => i.id === id)).find((x) => x != null) ?? null;
        } catch {
          item = null;
        }
        return {
          kind: p.kind,
          slug: p.slug,
          name: p.name,
          priceText: p.price != null ? formatPrice(p.price, lang) : null,
          specs: studioSurfaces(p.kind, printOfItem(p.kind, item)),
          item,
        };
      }),
    ).then((list) => !cancelled && setTargets(list));
    return () => {
      cancelled = true;
    };
  }, [phase, crossSell, targets.length, lang]);

  // ─── First document ──────────────────────────────────────────────────
  const initialDoc: StudioExtensions["initialDoc"] = async ({ specs, setVariant }) => {
    if (editLine?.design?.studio) {
      const stored = await loadDoc(editLine.design.studio.docId);
      if (stored) {
        if (stored.variantId) setVariant(stored.variantId);
        // A card made in the short edit opens there again (its picks were saved with it).
        const short: CardShortState | null = isCard && stored.step === "cardShort" ? parseCardShortState(stored.cardShort) : null;
        if (short) {
          setCardShort(short);
          setPhase("cardShort");
          return stored.doc;
        }
        setPhase(isPen && isPenFormDoc(stored.doc) ? "form" : "edit");
        return stored.doc;
      }
      setNote(t("photosMissing"));
      setPhase(startPhase);
      return null;
    }
    if (fromId) {
      const stored = await loadDoc(fromId);
      if (stored) {
        const d: StudioDoc = stored.doc.kind === kind ? stored.doc : adaptStudioDoc(stored.doc, kind, specs);
        setNote(t("fromOther"));
        setPhase(fromEdit ? "edit" : "verify");
        return { ...d, id: studioId("d") };
      }
    }
    if (!forceNew) {
      // Only drafts of this very product: another pen / mug has another print size and look.
      const drafts = resumableDrafts(await listDocs(kind), cartDocIds, product.slug);
      if (drafts[0]) {
        // The colour / size it was made for comes back with the design.
        if (drafts[0].variantId) setVariant(drafts[0].variantId);
        resumeStep.current = drafts[0].step ?? null;
        resumeShort.current = isCard && drafts[0].step === "cardShort" ? parseCardShortState(drafts[0].cardShort) : null;
        setPhase("resume");
        return drafts[0].doc;
      }
    }
    setPhase(startPhase);
    return null;
  };

  const extensions: StudioExtensions = {
    // Business cards: «Datele mele» first (the details are the card).
    initialTool: isCard ? "mydata" : "templates",
    ...(isCard ? { surfaceBar: (api: StudioEditorApi) => (phase === "edit" ? <StudioCardSideBar api={api} fields={fields} /> : null) } : {}),
    initialDoc,
    onDocChange,
    status: () => (saveState === "saving" ? t("saving") : t("saved")),
    panels: {
      templates: (api) => <StudioTemplatesPanel api={api} fields={fields} />,
      mydata: (api) => <StudioMyDataPanel api={api} fields={fields} onFields={setFields} />,
    },
    extraColors: () => STUDIO_COLOR_FIELD_KEYS.map((k) => fields[k]).filter((c): c is string => !!c),
    myFields: (api) => {
      const out: StudioFields = { ...fieldsFromDoc(api.doc) };
      for (const [k, v] of Object.entries(fields)) if (typeof v === "string" && v.trim()) (out as Record<string, string>)[k] = v;
      return out;
    },
    rightPanelTop: (api) => <QualityPanel api={api} />,
    // Business cards: no product preview over the canvas (flat card; the sides switch sits on top).
    ...(isCard ? {} : { canvasOverlay: (api: StudioEditorApi) => <StudioPreviewDock api={api} /> }),
    primaryAction: (api) =>
      phase === "edit" ? (
        <>
          {isPen ? (
            <button
              type="button"
              data-studio-pen-back-form
              onClick={() => setPhase("form")}
              aria-label={studioPenT(api.lang)("backToForm")}
              title={studioPenT(api.lang)("backToForm")}
              className="flex h-11 flex-none items-center justify-center rounded-[10px] border-[1.5px] border-(--line2) px-2.5 text-sm font-bold whitespace-nowrap md:px-3"
            >
              {api.isPhone ? <Icon d={STUDIO_ICONS.back} size={18} /> : studioPenT(api.lang)("backToForm")}
            </button>
          ) : null}
          <PrimaryAction
            api={api}
            hidePrice={(isPen || isCard) && api.isPhone}
            onContinue={() => {
              setFromForm(false);
              setVerifyBack("edit");
              setPhase("verify");
            }}
          />
        </>
      ) : null,
    screen: (api) => {
      switch (phase) {
        case "loading":
          return null;
        case "resume":
          return (
            <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
              <h1 className="m-0 text-2xl font-extrabold">{t("resumeTitle")}</h1>
              <p className="m-0 text-sm text-(--muted)">{t("resumeLead")}</p>
              <ResumePicture api={api} />
              <button
                type="button"
                className="min-h-12 rounded-xl bg-(--ink) font-extrabold text-white"
                onClick={() => {
                  if (resumeShort.current) {
                    setCardShort(resumeShort.current);
                    setPhase("cardShort");
                    return;
                  }
                  setPhase(isPen && isPenFormDoc(api.doc) ? "form" : resumeStep.current === "personalise" ? "personalise" : "edit");
                }}
              >
                {t("resumeYes")}
              </button>
              <button
                type="button"
                className="min-h-12 rounded-xl border-[1.5px] border-(--line2) font-bold"
                onClick={() => {
                  api.replaceDoc(emptyStudioDoc(kind, initialSurfaceBases(api.specs)), { resetHistory: true });
                  resumeShort.current = null;
                  setCardShort(null);
                  setPhase(startPhase);
                }}
              >
                {t("resumeNo")}
              </button>
            </div>
          );
        case "start":
          if (isCard) {
            return (
              <>
                {note ? <p className="m-0 bg-[#faf3dc] px-4 py-2 text-sm font-semibold text-[#7a6512]">{note}</p> : null}
                <StudioCardStart
                  api={api}
                  fields={fields}
                  onFields={setFields}
                  initialStep={cardStartStep}
                  onPick={async (tpl) => {
                    const state: CardShortState = cardShortStart(tpl);
                    const r = await cardShortDocMeasured(state, { fields, lang: api.lang, specs: api.specs, id: studioId("d") });
                    if (!r) return;
                    api.replaceDoc(r.doc, { resetHistory: true });
                    api.select(null);
                    api.setSurface(CARD_FRONT_ID);
                    setNote(null);
                    setCardShort(state);
                    setPhase("cardShort");
                  }}
                  onBlank={() => {
                    api.replaceDoc(cardWithFields(emptyStudioDoc("card", initialSurfaceBases(api.specs)), fields), { resetHistory: true });
                    api.select(null);
                    api.setSurface(CARD_FRONT_ID);
                    setNote(null);
                    setCardShort(null);
                    setPhase("edit");
                  }}
                />
              </>
            );
          }
          return (
            <>
              {note ? <p className="m-0 bg-[#faf3dc] px-4 py-2 text-sm font-semibold text-[#7a6512]">{note}</p> : null}
              <StudioStartScreen
                api={api}
                fields={fields}
                starter={starter}
                onStarter={setStarter}
                onStart={(doc, next) => {
                  api.replaceDoc(doc, { resetHistory: true });
                  api.select(null);
                  setNote(null);
                  setPhase(next);
                }}
              />
            </>
          );
        case "form":
          return (
            <>
              {note ? <p className="m-0 bg-[#faf3dc] px-4 py-2 text-sm font-semibold text-[#7a6512]">{note}</p> : null}
              <StudioPenForm
                api={api}
                qty={penQty}
                onQty={setPenQty}
                lastSignature={penSig.current}
                onSignature={(sig) => {
                  penSig.current = sig;
                }}
                onContinue={() => {
                  api.select(null);
                  setNote(null);
                  setFromForm(true);
                  setPhase("verify");
                }}
                onAdvanced={() => {
                  api.select(null);
                  setNote(null);
                  setPhase("edit");
                }}
              />
            </>
          );
        case "cardShort":
          if (!cardShort) return null;
          return (
            <StudioCardShort
              api={api}
              fields={fields}
              onFields={setFields}
              state={cardShort}
              onState={setCardShort}
              onAdvanced={() => {
                // From here on the full editor owns the card (no way back to the short form).
                setCardShort(null);
                api.select(null);
                api.setSurface(CARD_FRONT_ID);
                setPhase("edit");
              }}
              onContinue={() => {
                api.select(null);
                setPhase("verify");
              }}
              onGallery={() => {
                setCardStartStep("gallery");
                setPhase("start");
              }}
            />
          );
        case "personalise":
          return (
            <StudioPersonalise
              api={api}
              onBack={() => setPhase("start")}
              onEdit={(layerId) => {
                api.select(layerId ?? null);
                setPhase("edit");
              }}
              onContinue={() => {
                setFromForm(false);
                setVerifyBack("personalise");
                setPhase("verify");
              }}
            />
          );
        case "verify":
          if (isCard) {
            return (
              <CardVerifyStep
                api={api}
                editLine={editLine}
                onBack={() => {
                  setNote(null);
                  setPhase(cardShort ? "cardShort" : "edit");
                }}
                onAdded={() => {
                  setNote(null);
                  setCardShort(null);
                  setPhase("done");
                }}
              />
            );
          }
          return (
            <VerifyStep
              api={api}
              editLine={editLine}
              note={note}
              initialQty={fromForm ? penQty : undefined}
              onBack={() => {
                setNote(null);
                setPhase(fromForm ? "form" : verifyBack);
              }}
              onAdded={() => {
                // The cross-sell copy this page opened from is in the cart now: not a draft to resume.
                if (fromId) void deleteDoc(fromId);
                setNote(null);
                setPhase("done");
              }}
            />
          );
        case "done":
          return (
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-6 md:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#e7f5ec] p-4">
                <b className="text-[#1f6b3c]">✓ {t("doneTitle")}</b>
                <Link href={href("/shop/cos")} className="shop-btn-dark flex min-h-12 items-center rounded-xl bg-(--ink) px-5 font-extrabold text-white no-underline">
                  {t("viewCart")}
                </Link>
              </div>
              {targets.length ? (
                <StudioCrossSell
                  doc={api.doc}
                  fromKind={kind}
                  lang={lang}
                  renderAssets={api.renderAssets}
                  targets={targets}
                  title={t("otherProducts")}
                  onAdd={async (tg) => {
                    // The adapted copy goes to its own Studio page, straight to «Verifică designul».
                    const id = studioId("d");
                    await saveDoc({ id, kind: tg.kind, doc: { ...tg.doc, id }, slug: tg.slug });
                    router.push(href(studioEditorPath(tg.kind, { slug: tg.slug, from: id })));
                  }}
                  onEdit={async (tg) => {
                    // «Editează»: the same adapted copy, opened in the editor.
                    const id = studioId("d");
                    await saveDoc({ id, kind: tg.kind, doc: { ...tg.doc, id }, slug: tg.slug });
                    router.push(href(studioEditorPath(tg.kind, { slug: tg.slug, from: id, step: "edit" })));
                  }}
                  onStart={(tg) => router.push(href(studioEditorPath(tg.kind, { slug: tg.slug, fresh: true })))}
                />
              ) : null}
              <button type="button" onClick={() => setPhase("edit")} className="min-h-12 self-start rounded-xl border-[1.5px] border-(--line2) px-5 font-bold">
                {t("continueEditing")}
              </button>
            </div>
          );
        default:
          return null;
      }
    },
  };

  return <StudioApp kind={kind} product={product} variantId={variantId} editId={editLine?.id ?? null} extensions={extensions} />;
}

function QualityPanel({ api }: { api: StudioEditorApi }) {
  const q = useStudioQuality(api);
  return (
    <StudioQualityList
      q={q}
      lang={api.lang}
      selectedId={api.selectedId}
      onPick={(it) => {
        // A card's back item: show the back first.
        if (it.surfaceId) api.setSurface(it.surfaceId);
        if (it.layerId) api.select(it.layerId);
      }}
    />
  );
}

function CardVerifyStep(props: { api: StudioEditorApi; editLine: CartLine | null; onBack: () => void; onAdded: () => void }) {
  const q = useStudioQuality(props.api);
  return <StudioCardVerify api={props.api} quality={q} editLine={props.editLine} onBack={props.onBack} onAdded={props.onAdded} />;
}

function VerifyStep(props: { api: StudioEditorApi; editLine: CartLine | null; note: string | null; initialQty?: number; onBack: () => void; onAdded: () => void }) {
  const q = useStudioQuality(props.api);
  return (
    <StudioVerifyScreen
      api={props.api}
      quality={q}
      editLine={props.editLine}
      initialQty={props.initialQty ?? (props.editLine ? studioLineQuantity(props.editLine.quote) : 1)}
      note={props.note}
      onBack={props.onBack}
      onAdded={props.onAdded}
    />
  );
}

/** Top bar: quality chip, unit price, «Continuă» (blocked by red items; yellow ones are acknowledged first). */
function PrimaryAction({ api, onContinue, hidePrice = false }: { api: StudioEditorApi; onContinue: () => void; hidePrice?: boolean }) {
  const t = studioShopT(api.lang);
  const q = useStudioQuality(api);
  const [dialog, setDialog] = useState(false);
  // Business cards: the default pack with the sides the design has now.
  const cardSidesKey: number = api.kind === "card" ? api.doc.surfaces.length : 0;
  const quoteLine = useMemo(
    () => (api.kind === "card" ? cardQuoteLine(api.doc) : api.variant ? studioQuoteLine(api.kind, api.product, api.variant, 1) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a card re-quotes only when a side is added / removed
    [api.kind, api.product, api.variant, cardSidesKey],
  );
  const quote = useLiveQuote(quoteLine, api.lang);
  const price: number | null = quote.status === "done" && quote.line.ok ? quote.line.total : quote.status === "loading" && quote.previous?.ok ? quote.previous.total : null;
  const go = () => {
    if (q.blocks || q.yellow > 0) setDialog(true);
    else onContinue();
  };
  return (
    <>
      <StudioQualityChip q={q} lang={api.lang} onClick={() => setDialog(true)} compact={api.isPhone} />
      {price != null && !hidePrice ? (
        <span className="text-sm font-extrabold whitespace-nowrap md:text-base" data-studio-top-price>
          {api.kind === "card" ? studioCardT(api.lang)("priceTop", { price: formatPrice(price, api.lang), n: SHOP_BC_DEFAULT_PACK }) : formatPrice(price, api.lang)}
        </span>
      ) : null}
      <button
        type="button"
        data-studio-continue
        onClick={go}
        disabled={q.blocks}
        title={q.blocks ? t("qualityBlocked") : undefined}
        aria-describedby={q.blocks ? "studio-blocked" : undefined}
        className="shop-btn-dark flex h-11 flex-none items-center rounded-[10px] bg-(--ink) px-3 text-sm font-extrabold whitespace-nowrap text-white disabled:opacity-40 md:px-4 md:text-[15px]"
      >
        {api.isPhone ? t("inCart") : t("continue")}
      </button>
      <span id="studio-blocked" className="sr-only">
        {q.blocks ? t("qualityBlocked") : ""}
      </span>
      {dialog ? (
        <StudioQualityDialog
          q={q}
          lang={api.lang}
          onPick={(it) => {
            if (it.layerId) api.select(it.layerId);
            setDialog(false);
          }}
          onAccept={() => {
            setDialog(false);
            onContinue();
          }}
          onClose={() => setDialog(false)}
        />
      ) : null}
    </>
  );
}

/** The saved design on the product, on «Continui designul început?». */
function ResumePicture({ api }: { api: StudioEditorApi }) {
  const look = useStudioProductLook(api);
  const assets = useStableAssets(api.renderAssets);
  return (
    <div className="overflow-hidden rounded-xl" data-studio-resume-picture>
      <StudioLivePicture doc={api.doc} spec={api.spec} assets={assets} look={look} version={api.version} label={studioStartT(api.lang)("previewAlt")} />
    </div>
  );
}
