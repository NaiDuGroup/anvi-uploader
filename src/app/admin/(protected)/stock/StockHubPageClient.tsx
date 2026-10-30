"use client";

import Link from "next/link";
import useSWR from "swr";
import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Boxes,
  ChevronRight,
  ClipboardCheck,
  Coffee,
  BookOpen,
  CreditCard,
  FlaskConical,
  Footprints,
  Layers,
  Package,
  Pencil,
  Printer,
  Settings2,
  Ship,
  Shirt,
  Stamp,
  SunMedium,
  Tags,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { stockSwrFetcher } from "@/app/admin/_components/stock/unified/stockApi";
import { SupplierMediaBulkPanel } from "@/app/admin/_components/stock/unified/SupplierMediaBulkPanel";
import { localizedStockName, type StockCategoryJson } from "@/lib/stock/unified/adminTypes";
import { StockCategoryKind } from "@/lib/stock/unified/kinds";
import { isPrinterConsumableCategory } from "@/lib/stock/unified/printerAdmin";
import { dedicatedCategoryPage } from "@/lib/stock/unified/dedicatedCategoryPages";
import type { StockSectionId } from "@/lib/i18n/types";
import { PrintMethodCode, printMethodPagePath } from "@/lib/printMethods/methods";

type StockHubCard = {
  href: string;
  title: string;
  hint: string;
  Icon: LucideIcon;
  /** Full class strings (kept static so Tailwind can see them). */
  linkAccent: string;
  iconTile: string;
  chevronAccent: string;
};

type StockHubSection = {
  id: string;
  title: string;
  cards: StockHubCard[];
};

type CardAccent = Pick<StockHubCard, "linkAccent" | "iconTile" | "chevronAccent">;

/** Look of a category card: icon, accent and (optionally) its fixed one-line hint. */
type CategoryLook = CardAccent & { Icon: LucideIcon; section?: StockSectionId };

/**
 * Categories with a familiar look on the hub (and a fixed hint from
 * `t.admin.stockSections`); any other category gets a cycled accent and its item count.
 */
const CATEGORY_LOOKS: Readonly<Record<string, CategoryLook>> = {
  mugs: {
    Icon: Coffee,
    section: "mugs",
    linkAccent: "hover:border-amber-200/90 focus-visible:ring-amber-500/50",
    iconTile: "bg-amber-50 text-amber-800 ring-amber-100",
    chevronAccent: "group-hover:text-amber-700",
  },
  notebooks: {
    Icon: BookOpen,
    section: "notebooks",
    linkAccent: "hover:border-emerald-200/90 focus-visible:ring-emerald-500/50",
    iconTile: "bg-emerald-50 text-emerald-800 ring-emerald-100",
    chevronAccent: "group-hover:text-emerald-700",
  },
  pens: {
    Icon: Pencil,
    section: "pens",
    linkAccent: "hover:border-rose-200/90 focus-visible:ring-rose-500/50",
    iconTile: "bg-rose-50 text-rose-800 ring-rose-100",
    chevronAccent: "group-hover:text-rose-700",
  },
  roll_media: {
    Icon: Package,
    section: "lfMaterials",
    linkAccent: "hover:border-sky-200/90 focus-visible:ring-sky-500/50",
    iconTile: "bg-sky-50 text-sky-800 ring-sky-100",
    chevronAccent: "group-hover:text-sky-700",
  },
  sheet_paper: {
    Icon: CreditCard,
    section: "sheetPapers",
    linkAccent: "hover:border-teal-200/90 focus-visible:ring-teal-500/50",
    iconTile: "bg-teal-50 text-teal-800 ring-teal-100",
    chevronAccent: "group-hover:text-teal-700",
  },
};

/** Accents for other categories, cycled in order (static strings for Tailwind). */
const CYCLED_ACCENTS: readonly CardAccent[] = [
  {
    linkAccent: "hover:border-orange-200/90 focus-visible:ring-orange-500/50",
    iconTile: "bg-orange-50 text-orange-800 ring-orange-100",
    chevronAccent: "group-hover:text-orange-700",
  },
  {
    linkAccent: "hover:border-indigo-200/90 focus-visible:ring-indigo-500/50",
    iconTile: "bg-indigo-50 text-indigo-800 ring-indigo-100",
    chevronAccent: "group-hover:text-indigo-700",
  },
  {
    linkAccent: "hover:border-lime-200/90 focus-visible:ring-lime-500/50",
    iconTile: "bg-lime-50 text-lime-800 ring-lime-100",
    chevronAccent: "group-hover:text-lime-700",
  },
  {
    linkAccent: "hover:border-cyan-200/90 focus-visible:ring-cyan-500/50",
    iconTile: "bg-cyan-50 text-cyan-800 ring-cyan-100",
    chevronAccent: "group-hover:text-cyan-700",
  },
  {
    linkAccent: "hover:border-pink-200/90 focus-visible:ring-pink-500/50",
    iconTile: "bg-pink-50 text-pink-800 ring-pink-100",
    chevronAccent: "group-hover:text-pink-700",
  },
];

const CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
  socks: Footprints,
  bodysuits: Baby,
  tshirts: Shirt,
  hoodies: Shirt,
};

function categoryIcon(c: StockCategoryJson): LucideIcon {
  const byCode: LucideIcon | undefined = CATEGORY_ICONS[c.code];
  if (byCode) return byCode;
  if (c.kind === StockCategoryKind.Material) return Layers;
  if (c.kind === StockCategoryKind.Consumable) return FlaskConical;
  return Boxes;
}

/** Category page: its dedicated screen (mugs, rolls…) or the generic category page. */
function categoryHref(code: string): string {
  return dedicatedCategoryPage(code) ?? `/admin/stock/c/${encodeURIComponent(code)}`;
}

export default function StockHubPageClient({ canManageImports = false }: { canManageImports?: boolean }) {
  const { t, locale } = useLanguageStore();
  const { data, error } = useSWR<{ categories: StockCategoryJson[] }>(
    "/api/admin/stock/categories?active=1",
    stockSwrFetcher,
  );
  const loading: boolean = data === undefined && error === undefined;
  // Active categories in their sort order. Printer consumables (ink, toner, DTF film /
  // powder) are kept per printer, so the «Принтеры» card stands for them.
  const categories: StockCategoryJson[] = (data?.categories ?? []).filter(
    (c) => !isPrinterConsumableCategory(c.code),
  );

  const categoryCards = (kinds: readonly StockCategoryKind[]): StockHubCard[] => {
    let cycled = 0;
    return categories
      .filter((c) => kinds.includes(c.kind))
      .map((c) => {
        const look: CategoryLook | undefined = CATEGORY_LOOKS[c.code];
        const accent: CardAccent = look ?? CYCLED_ACCENTS[cycled++ % CYCLED_ACCENTS.length]!;
        return {
          href: categoryHref(c.code),
          title: localizedStockName(c, locale),
          hint: look?.section ? t.admin.stockSections[look.section].hint : t.stock.hubItemCount(c.itemCount),
          Icon: look?.Icon ?? categoryIcon(c),
          linkAccent: accent.linkAccent,
          iconTile: accent.iconTile,
          chevronAccent: accent.chevronAccent,
        };
      });
  };

  // DTF / UV price lists and norms: not categories, kept next to the printers.
  const dtfCard: StockHubCard = {
    href: printMethodPagePath(PrintMethodCode.Dtf),
    title: t.admin.stockSections.dtf.title,
    hint: t.admin.stockSections.dtf.hint,
    Icon: Stamp,
    linkAccent: "hover:border-fuchsia-200/90 focus-visible:ring-fuchsia-500/50",
    iconTile: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-100",
    chevronAccent: "group-hover:text-fuchsia-700",
  };
  const uvCard: StockHubCard = {
    href: printMethodPagePath(PrintMethodCode.Uv),
    title: t.admin.stockSections.uv.title,
    hint: t.admin.stockSections.uv.hint,
    Icon: SunMedium,
    linkAccent: "hover:border-purple-200/90 focus-visible:ring-purple-500/50",
    iconTile: "bg-purple-50 text-purple-800 ring-purple-100",
    chevronAccent: "group-hover:text-purple-700",
  };
  const productCards: StockHubCard[] = categoryCards([StockCategoryKind.Product]);

  const printersCard: StockHubCard = {
    href: "/admin/stock/printers",
    title: t.admin.stockSections.printers.title,
    hint: t.admin.stockSections.printers.hint,
    Icon: Printer,
    linkAccent: "hover:border-violet-200/90 focus-visible:ring-violet-500/50",
    iconTile: "bg-violet-50 text-violet-800 ring-violet-100",
    chevronAccent: "group-hover:text-violet-700",
  };

  // Imports carry purchase money: super admins only.
  const importsCard: StockHubCard = {
    href: "/admin/stock/imports",
    title: t.imports.hubTitle,
    hint: t.imports.hubHint,
    Icon: Ship,
    linkAccent: "hover:border-sky-200/90 focus-visible:ring-sky-500/50",
    iconTile: "bg-sky-50 text-sky-800 ring-sky-100",
    chevronAccent: "group-hover:text-sky-700",
  };

  const sections: StockHubSection[] = [
    ...(canManageImports ? [{ id: "purchasing" as StockHubSection["id"], title: t.imports.hubSection, cards: [importsCard] }] : []),
    { id: "products", title: t.admin.stockHubSectionProducts, cards: productCards },
    {
      id: "materials",
      title: t.admin.stockHubSectionMaterials,
      cards: [printersCard, dtfCard, uvCard, ...categoryCards([StockCategoryKind.Material, StockCategoryKind.Consumable])],
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t.admin.navStock}</h1>
          <p className="mt-1 text-sm text-gray-600">{t.admin.stockHubIntro}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 self-start">
          {[
            { href: "/admin/stock/prices", label: t.stockBulk.hubPricesLink, Icon: Tags },
            { href: "/admin/stock/stocktake", label: t.stockBulk.hubStocktakeLink, Icon: ClipboardCheck },
            { href: "/admin/stock/categories", label: t.stock.hubCategoriesLink, Icon: Settings2 },
          ].map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={buttonVariants({ variant: "outline" })}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </div>

      <SupplierMediaBulkPanel t={t} />

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`stock-hub-${section.id}`}>
            <h2
              id={`stock-hub-${section.id}`}
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              {section.title}
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {section.cards.map(({ href, title, hint, Icon, linkAccent, iconTile, chevronAccent }) => (
                <li key={href} className="flex">
                  <Link
                    href={href}
                    className={`group flex w-full min-w-0 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 ${linkAccent}`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${iconTile}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900 group-hover:text-gray-950">
                        {title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-gray-600" title={hint}>
                        {hint}
                      </span>
                    </span>
                    <ChevronRight
                      className={`h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 ${chevronAccent}`}
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
              {loading &&
                [0, 1].map((i) => (
                  <li key={`loading-${i}`} className="flex" aria-hidden>
                    <span className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                      <span className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-gray-100" />
                      <span className="min-w-0 flex-1 space-y-1.5">
                        <span className="block h-3.5 w-2/3 animate-pulse rounded bg-gray-100" />
                        <span className="block h-3 w-1/2 animate-pulse rounded bg-gray-100" />
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
