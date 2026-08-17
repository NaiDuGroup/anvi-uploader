export type Locale = "ro" | "ru" | "en";

export const LOCALES: Locale[] = ["ro", "ru", "en"];

export const LOCALE_LABELS: Record<Locale, string> = {
  ro: "Română",
  ru: "Русский",
  en: "English",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  ro: "🇲🇩",
  ru: "🇷🇺",
  en: "🇬🇧",
};

export const DEFAULT_LOCALE: Locale = "ro";

export interface TranslationDictionary {
  common: {
    orderId: string;
    status: string;
    phone: string;
    files: string;
    file: string;
    created: string;
    createdBySentBy: string;
    createdByClient: string;
    statusChangedBy: string;
    actions: string;
    refresh: string;
    submit: string;
    submitting: string;
    copied: string;
    loading: string;
    submitted: string;
    imageLoadError: string;
    unexpectedError: string;
    tryAgain: string;
  };
  upload: {
    title: string;
    subtitle: string;
    dragDrop: string;
    browseFiles: string;
    addMore: string;
    phoneLabel: string;
    phonePlaceholder: string;
    phoneError: string;
    submitOrder: string;
    colorOption: string;
    bwOption: string;
    colorModeLabel: string;
    stepFiles: string;
    stepDetails: string;
    stepConfirm: string;
    next: string;
    back: string;
    paperSize: string;
    paperA0: string;
    paperA1: string;
    paperA2: string;
    paperA3: string;
    paperA4: string;
    paperA5: string;
    paperA6: string;
    paperOther: string;
    widthCm: string;
    heightCm: string;
    notesLabel: string;
    notesPlaceholder: string;
    applyAll: string;
    sameSettings: string;
    differentSettings: string;
    copiesLabel: string;
    copiesQuickPresetsAria: string;
    gdprTitle: string;
    gdprBody: string;
    gdprConsent: string;
    gdprSubmit: string;
    dataNotice: string;
    uploadingFile: string;
    orPasteLink: string;
    linkPlaceholder: string;
    addLink: string;
    externalLink: string;
  };
  privacy: {
    bannerText: string;
    learnMore: string;
    modalTitle: string;
    modalBody: string;
    modalClose: string;
    successReminder: string;
  };
  success: {
    title: string;
    message: string;
    copyLink: string;
    viewStatus: string;
  };
  admin: {
    title: string;
    workshopTitle: string;
    navOrders: string;
    navClients: string;
    navMugCatalog: string;
    navNotebookCatalog: string;
    /** Top nav: warehouse hub (workshop / super admin only) */
    navStock: string;
    /** Warehouse hub page subtitle */
    stockHubIntro: string;
    /** Stock hub link: wide-format materials catalog */
    navLfMaterials: string;
    /** Link from mug/notebook catalog back to /admin/stock */
    backToStockHub: string;
    navPrimaryAriaLabel: string;
    appShellSubtitle: string;
    clientPickerLabel: string;
    clientPickerNone: string;
    clientPickerClear: string;
    clientPickerSearch: string;
    clientPickerEmpty: string;
    clientPickerLoading: string;
    orderClientFromRegistryLockedHint: string;
    orderStudioClient: string;
    orderRegistrySourceBadge: string;
    clientsTitle: string;
    clientsSubtitle: string;
    clientsAdd: string;
    clientsSearchPlaceholder: string;
    clientsKindIndividual: string;
    clientsKindLegal: string;
    clientsPhone: string;
    clientsPersonName: string;
    clientsCompanyName: string;
    clientsCompanyIdno: string;
    clientsEdit: string;
    clientsDelete: string;
    clientsSave: string;
    clientsCreating: string;
    clientsUpdating: string;
    clientsNoRows: string;
    clientsLoading: string;
    clientsConfirmDeleteTitle: string;
    clientsConfirmDeleteBody: string;
    clientsDuplicatePhone: string;
    clientsSaveFailed: string;
    clientsValidationFailed: string;
    clientsUnauthorized: string;
    clientsLoadFailed: string;
    /** Customer-portal admin extensions (superadmin only). */
    clientsDealerColumn: string;
    clientsDealerYes: string;
    clientsDealerNo: string;
    clientsPortalColumn: string;
    clientsPortalCreated: string;
    clientsPortalNone: string;
    clientsCreatePortalAccount: string;
    clientsPortalModalTitle: string;
    clientsPortalIntro: string;
    clientsPortalPasswordLabel: string;
    clientsPortalPasswordHint: string;
    clientsPortalRegenerate: string;
    clientsPortalCreate: string;
    clientsPortalCreating: string;
    clientsPortalCreatedSuccess: string;
    clientsPortalHandoverHint: string;
    clientsPortalCopy: string;
    clientsPortalCopied: string;
    clientsPortalDone: string;
    clientsPortalCreateFailed: string;
    searchPlaceholder: string;
    clearSearch: string;
    noOrders: string;
    loadingOrders: string;
    order: string;
    take: string;
    workshop: string;
    ready: string;
    issue: string;
    startPrinting: string;
    filesCount: (count: number) => string;
    /** Tooltip / aria: total mugs & notebooks to manufacture on this line / order slice. */
    orderPiecesQtyLabel: (n: number) => string;
    /** Inline admin badge: mug/notebook piece count (distinct from paper file ×N copies). */
    orderSkuPiecesBadge: (n: number) => string;
    /** Tooltip / aria for paper-print ×N copies on one file row. */
    paperFileCopiesLabel: (n: number) => string;
    /** Order mixes several product families (e.g. paper + mug). */
    productTypeMixed: string;
    /** Wide-format roll printing line */
    productTypeLargeFormat: string;
    /** Admin order list: LF line size badge, e.g. 60×90 cm */
    lfOrderLineSizeLabel: (widthCm: number, heightCm: number) => string;
    /** Admin order list: LF line piece count tooltip */
    lfOrderLineQtyLabel: (n: number) => string;
    lfFilePrintCopiesBadge: (n: number) => string;
    /** Admin order list: badge showing number of different LF designs on a line, e.g. "2 дизайна" */
    lfOrderLineDesignsCount: (n: number) => string;
    /** Per-file download action in orders list Files column tooltip / aria-label. */
    downloadFile: string;
    downloadAll: string;
    filesShowList: (count: number) => string;
    filesHideList: string;
    takenBy: string;
    specs: string;
    notes: string;
    allSameSettings: string;
    color: string;
    bw: string;
    copies: string;
    paper: string;
    pages: string;
    pagesCount: (n: number) => string;
    issueModalTitle: string;
    issueReasons: {
      fileCorrupt: string;
      wrongFormat: string;
      lowQuality: string;
      missingPages: string;
      other: string;
    };
    issueReasonPlaceholder: string;
    issueConfirm: string;
    returnToWork: string;
    deliver: string;
    received: string;
    comments: string;
    noComments: string;
    commentPlaceholder: string;
    sendComment: string;
    newComments: string;
    commentEdit: string;
    commentDelete: string;
    commentSave: string;
    commentCancel: string;
    commentEdited: string;
    commentDeleteConfirm: string;
    /** Separate client-facing message channel (admin side). */
    clientChat: string;
    clientChatButton: string;
    clientChatPlaceholder: string;
    clientChatEmpty: string;
    clientChatClientBadge: string;
    clientChatSending: string;
    newClientMessages: string;
    notesEdit: string;
    notesAdd: string;
    notesPlaceholder: string;
    notesSave: string;
    notesCancel: string;
    loggedInAs: string;
    roleAdmin: string;
    roleSuperAdmin: string;
    roleWorkshop: string;
    newOrder: string;
    createOrder: string;
    /** Wizard page strings (`/admin/orders/new`) */
    newOrderPage: {
      title: string;
      /** Step 1: upload files */
      stepFilesLabel: string;
      /** Progress label when files + product assignment share one wizard step */
      stepFilesProductsLabel: string;
      /** Step 2: product / SKU per row */
      stepAssignLabel: string;
      stepProductLabel: string;
      stepModeLabel: string;
      stepDesignLabel: string;
      /** Progress label: step 1 after merging client into builder (two-step wizard) */
      stepOrderBuilderLabel: string;
      /** Retail subtotal hint: SKU price × copies, catalog lines only */
      catalogLinesTotal: string;
      stepClientLabel: string;
      stepConfirmLabel: string;
      stepIndicator: (current: number, total: number) => string;
      cancel: string;
      next: string;
      back: string;
      createSuccess: string;
      confirmTitle: string;
      confirmHint: string;
      /** Heading of the per-file upload checklist shown while submitting */
      uploadProgressTitle: string;
      /** Upload checklist counter, e.g. "Uploaded 2 of 4" */
      uploadProgressCount: (done: number, total: number) => string;
      /** Confirmation table: file name column */
      confirmTableHeaderFile: string;
      /** Confirmation table: quantity / copies column */
      confirmTableHeaderQty: string;
      fileUploadTitle: string;
      fileUploadHint: string;
      fileUploadDrop: string;
      bulkSelectAll: string;
      bulkSetProduct: string;
      bulkApply: string;
      /** Append an empty wizard row (up to catalog limit). */
      addOrderPosition: string;
      /** Per-row file picker label when no upload yet (`aria-label` on input wrapper). */
      attachFileRowAriaLabel: string;
      /** Visible link/control to attach a layout file without using the bulk drop-zone. */
      attachFileRow: string;
      /** Shown beside checkbox when row has no file yet. */
      fileNotChosenPlaceholder: string;
      /** Empty state inside fixed-height roll schematic frame. */
      lfPackPreviewPlaceholder: string;
      /** Remove one file from the wizard list (step 1) — `aria-label` */
      removeFileAriaLabel: string;
      /** Heading above per-file dimension checks for mug/notebook uploads */
      layoutChecksTitle: string;
      /** Shown while validating an image file */
      layoutCheckPending: string;
      /** Full-screen catalog picker (mug) */
      catalogSkuModalTitleMug: string;
      /** Full-screen catalog picker (notebook) */
      catalogSkuModalTitleNotebook: string;
      catalogSkuSearchPlaceholder: string;
      catalogSkuGridEmpty: string;
      /** Opens the SKU grid modal (`aria-label` on compact trigger) */
      catalogSkuOpenPickerAriaLabel: string;
      /** Table action: open modal to change SKU */
      catalogSkuChangeProduct: string;
      /** Table action: open modal when no catalog product */
      catalogSkuAddProduct: string;
      lfMaterialLabel: string;
      /** LF wizard: pick a size from the material's price-list presets (when defined). */
      lfSizePresetLabel: string;
      lfSizePresetCustomOption: string;
      lfSizePresetOptionLabel: (
        widthCm: number,
        heightCm: number,
        priceMdl: number,
      ) => string;
      lfSizePresetLockedHint: string;
      lfWidthCm: string;
      lfHeightCm: string;
      lfQuantity: string;
      lfCustomerType: string;
      lfRetail: string;
      lfDealer: string;
      lfRollMaxWidth: (rollWidthM: string) => string;
      /** Nominal roll width label (catalog field). */
      lfRollNominalWidthM: (rollWidthM: string) => string;
      /** Derived printable width across roll (cm), after trim / optional override. */
      lfEffectivePrintableWidthCm: (cm: number) => string;
      lfPackPreviewTitle: string;
      lfPackDoesNotFit: string;
      lfPackQuantityTooLarge: (max: number) => string;
      lfLinearMetersCalc: (meters: number) => string;
      /** LF compact breakdown: useful printed area (layout × qty). */
      lfUsefulPrintAreaSqmLabel: string;
      /** LF compact breakdown: total line price ÷ useful printed m². */
      lfPricePerPrintedSqm: string;
      lfMatCost: string;
      lfMatSell: string;
      lfPrintSell: string;
      /** Revenue from ink markup (shown when printSellPrice > 0). */
      lfInkSellRevenue: string;
      /** Marks row for applied LF ink markup multiplier vs COGS */
      lfInkMarkupApplied: (multiplier: number) => string;
      /** Effective ink sell rate per printed m² (useful layout area). */
      lfInkEffectiveSellPerSqm: string;
      /** Shown when ink markup multipliers are 0 in accounting settings. */
      lfInkSellOffHint: string;
      lfTotal: string;
      lfProfit: string;
      lfInkMlUsed: string;
      lfInkCostLabel: string;
      lfDirectCostLabel: string;
      lfMarginPercentLabel: string;
      lfEfficiencyLabel: string;
      /** Gross profit estimate after roll + ink direct cost (wizard LF detail). */
      lfEstProfitAfterDirect: string;
      lfMinimumOrderWarning: (minimumMdl: number) => string;
      /** LF line bumped to accounting floor (floor MDL, uplift MDL → material sell). */
      lfMinimumLineUpliftNote: (floorMdl: number, upliftMdl: number) => string;
      lfWidthExceedsRoll: string;
      /** Print size does not fit across printable width (rotation allowed): max cross = printableCm */
      lfPrintExceedsPrintableWidthCm: (
        printableCm: number,
        widthCm: number,
        heightCm: number,
      ) => string;
      lfLfPreviewEnterDimensions: string;
      lfLfPreviewEnterCopies: string;
      /** Short label for successful layout check in the table */
      layoutCheckOkShort: string;
      /** Edit order: replace mug/notebook layout PNG from disk */
      replaceLayoutImage: string;
      replaceLayoutImageAriaLabel: string;
    };
    /** Full-screen edit order wizard (`/admin/orders/[id]/edit`) */
    editOrderPage: {
      title: string;
      save: string;
      saving: string;
    };
    /** Catalog edit form: print parameters block (size + DPI + 3D toggle) */
    printDimensions: {
      sectionTitle: string;
      widthCm: string;
      heightCm: string;
      dpi: string;
      has3dPreview: string;
      has3dPreviewHint: string;
      pixelPreview: (w: number, h: number) => string;
      /** Hint shown above the colors block when 3D preview is disabled. */
      colorsDisabledHint: string;
    };
    /** Layout uploads: validation messages for catalog product size mismatch */
    layoutValidation: {
      sizeMismatch: (
        expectedW: number,
        expectedH: number,
        actualW: number,
        actualH: number,
      ) => string;
      requiredSizeHint: (w: number, h: number) => string;
      readDimensionsFailed: string;
    };
    /** "Click to enlarge" hint shown above the compact uploaded layout preview */
    layoutPreviewZoomHint: string;
    /** Aria-label for the zoom-in icon button on the compact preview */
    layoutPreviewOpen: string;
    /** Aria-label for the close button on the zoomed preview modal */
    layoutPreviewClose: string;
    /** 3D preview: mug handle colour (admin pilot) */
    mugHandleColor: string;
    mugHandleColorHint: string;
    mugHandleColorCustom: string;
    mugProductPickLabel: string;
    mugProductPickHint: string;
    mugProductCatalogEmpty: string;
    mugProductOtherLabel: string;
    mugProductOtherHint: string;
    mugCatalogTitle: string;
    /** @deprecated No longer shown on catalog page; kept for compatibility */
    mugCatalogSubtitle: string;
    mugCatalogAdd: string;
    /** @deprecated Refresh control removed from catalog page */
    mugCatalogReload: string;
    mugCatalogSearchPlaceholder: string;
    mugCatalogSearchEmpty: string;
    /** Table badge when SKU is active in catalog */
    mugCatalogBadgeActive: string;
    /** Table badge when SKU is hidden */
    mugCatalogBadgeInactive: string;
    mugCatalogColSku: string;
    mugCatalogColNameRo: string;
    mugCatalogColNameRu: string;
    mugCatalogColNameEn: string;
    /** Modal: heading above RO/RU/EN name fields */
    mugCatalogNamesSection: string;
    mugCatalogColPhoto: string;
    mugCatalogColStock: string;
    /** @deprecated Hint removed from catalog page */
    mugCatalogStockHint: string;
    mugCatalogPhotoDrop: string;
    mugCatalogSkuTaken: string;
    mugCatalogColBody: string;
    mugCatalogColHandle: string;
    mugCatalogColInner: string;
    mugCatalogColRim: string;
    /** Section heading above body/handle/inner/rim pickers */
    mugCatalogColorsSection: string;
    mugCatalogColActive: string;
    mugCatalogColSellPrice: string;
    mugCatalogColPurchaseCost: string;
    mugCatalogFieldPurchaseCost: string;
    mugCatalogColDealerPrice: string;
    mugCatalogOpenEdit: string;
    mugCatalogCopy: string;
    mugCatalogDelete: string;
    mugCatalogDeleteConfirmTitle: string;
    mugCatalogDeleteConfirmDescription: (name: string) => string;
    mugCatalogDeleteBlockedTitle: string;
    mugCatalogDeleteBlockedDescription: string;
    mugCatalogDeleteDeactivateInstead: string;
    mugCatalogDeleteFailed: string;
    /** Table header above copy/edit icons */
    mugCatalogColActions: string;
    mugCatalogModalAddTitle: string;
    mugCatalogModalEditTitle: string;
    mugCatalogCancel: string;
    mugCatalogInternalNotes: string;
    mugCatalogSave: string;
    /** Mug stock: create/restore order */
    orderStockInsufficient: (requested: number, available: number) => string;
    mugCatalogReceiptOpen: string;
    mugCatalogReceiptTitle: string;
    mugCatalogReceiptQtyLabel: string;
    mugCatalogReceiptNote: string;
    mugCatalogReceiptSave: string;
    mugCatalogReceiptNoLines: string;
    mugCatalogReceiptFailed: string;
    mugCatalogHistoryOpen: string;
    mugCatalogHistoryTitle: string;
    mugCatalogHistoryEmpty: string;
    mugCatalogHistoryLoading: string;
    mugCatalogMovementSale: (orderNum: number) => string;
    mugCatalogMovementReturn: string;
    mugCatalogMovementReceipt: string;
    notebookProductPickLabel: string;
    notebookProductPickHint: string;
    notebookProductCatalogEmpty: string;
    notebookProductOtherLabel: string;
    notebookProductOtherHint: string;
    notebookCatalogTitle: string;
    notebookCatalogAdd: string;
    notebookCatalogSearchPlaceholder: string;
    notebookCatalogSearchEmpty: string;
    notebookCatalogBadgeActive: string;
    notebookCatalogBadgeInactive: string;
    notebookCatalogColSku: string;
    notebookCatalogColNameRo: string;
    notebookCatalogColNameRu: string;
    notebookCatalogColNameEn: string;
    notebookCatalogNamesSection: string;
    notebookCatalogColPhoto: string;
    notebookCatalogColStock: string;
    notebookCatalogPhotoDrop: string;
    notebookCatalogSkuTaken: string;
    notebookCatalogColCover: string;
    notebookCatalogColStrap: string;
    notebookCatalogColBookmark: string;
    notebookCatalogColorsSection: string;
    notebookCatalogColPaperKind: string;
    notebookCatalogPaperKindHint: string;
    notebookPaperKindRuled: string;
    notebookPaperKindSquared: string;
    notebookPaperKindDated: string;
    notebookCatalogColActive: string;
    notebookCatalogColSellPrice: string;
    notebookCatalogColPurchaseCost: string;
    notebookCatalogFieldPurchaseCost: string;
    notebookCatalogColDealerPrice: string;
    notebookCatalogOpenEdit: string;
    notebookCatalogCopy: string;
    notebookCatalogDelete: string;
    notebookCatalogDeleteConfirmTitle: string;
    notebookCatalogDeleteConfirmDescription: (name: string) => string;
    notebookCatalogDeleteBlockedTitle: string;
    notebookCatalogDeleteBlockedDescription: string;
    notebookCatalogDeleteDeactivateInstead: string;
    notebookCatalogDeleteFailed: string;
    notebookCatalogColActions: string;
    notebookCatalogModalAddTitle: string;
    notebookCatalogModalEditTitle: string;
    notebookCatalogCancel: string;
    notebookCatalogInternalNotes: string;
    notebookCatalogSave: string;
    notebookCatalogReceiptOpen: string;
    notebookCatalogReceiptTitle: string;
    notebookCatalogReceiptQtyLabel: string;
    notebookCatalogReceiptNote: string;
    notebookCatalogReceiptSave: string;
    notebookCatalogReceiptNoLines: string;
    notebookCatalogReceiptFailed: string;
    notebookCatalogHistoryOpen: string;
    notebookCatalogHistoryTitle: string;
    notebookCatalogHistoryEmpty: string;
    notebookCatalogHistoryLoading: string;
    notebookCatalogMovementSale: (orderNum: number) => string;
    notebookCatalogMovementReturn: string;
    notebookCatalogMovementReceipt: string;
    lfMaterialCatalogTitle: string;
    lfMaterialCatalogAdd: string;
    lfMaterialCatalogSearchPlaceholder: string;
    lfMaterialCatalogSearchEmpty: string;
    lfMaterialCatalogBadgeActive: string;
    lfMaterialCatalogBadgeInactive: string;
    lfMaterialCatalogColName: string;
    lfMaterialCatalogColRollWidthM: string;
    /** Optional catalog override; empty uses roll width minus trim. */
    lfMaterialCatalogColPrintableWidthM: string;
    lfMaterialCatalogPrintableWidthHint: string;
    /** Material COGS hint (WA or legacy). */
    lfMaterialCatalogColEffectiveCostLm: string;
    lfMaterialCatalogColFinalRetailLm: string;
    lfMaterialCatalogColFinalDealerLm: string;
    /** Optional per-material override; empty uses accounting multipliers × effective cost. */
    lfMaterialCatalogManualRetailLmOptional: string;
    lfMaterialCatalogManualDealerLmOptional: string;
    lfMaterialCatalogManualPriceHint: string;
    lfMaterialCatalogManualPriceBadge: string;
    lfMaterialCatalogEffectiveCostHint: string;
    lfMaterialCatalogReferenceInkCostPerSqm: string;
    lfMaterialCatalogColActive: string;
    lfMaterialCatalogColActions: string;
    lfMaterialCatalogModalAddTitle: string;
    lfMaterialCatalogModalEditTitle: string;
    lfMaterialCatalogCancel: string;
    lfMaterialCatalogSave: string;
    lfMaterialCatalogDelete: string;
    lfMaterialCatalogDeleteConfirmTitle: string;
    lfMaterialCatalogDeleteConfirmDescription: (materialName: string) => string;
    lfMaterialCatalogLoadErrorGeneric: string;
    lfMaterialCatalogLoadErrorSetup: string;
    lfMaterialCatalogLoadErrorUnauthorized: string;
    lfMaterialCatalogColStockLm: string;
    lfMaterialCatalogColAvgLm: string;
    lfMaterialCatalogColPurchaseM2: string;
    lfMaterialCatalogReceiptBtn: string;
    /** Per-material price list of fixed sizes (e.g. canvas 21x30 / 30x42 / ...). */
    lfSizePresetsBtn: string;
    lfSizePresetsTitle: string;
    lfSizePresetsAdd: string;
    lfSizePresetsWidthCm: string;
    lfSizePresetsHeightCm: string;
    lfSizePresetsRetail: string;
    lfSizePresetsDealer: string;
    lfSizePresetsSortOrder: string;
    lfSizePresetsActive: string;
    lfSizePresetsActions: string;
    lfSizePresetsEmpty: string;
    lfSizePresetsCountBadge: (n: number) => string;
    lfSizePresetsDuplicateSizeError: string;
    lfSizePresetsSaveFailed: string;
    lfSizePresetsDeleteConfirmTitle: string;
    lfSizePresetsDeleteConfirmBody: (size: string) => string;
    lfRollReceiptModalTitle: string;
    lfRollReceiptQtyLm: string;
    lfRollReceiptTotalMdl: string;
    lfRollReceiptDate: string;
    lfRollReceiptSupplier: string;
    lfRollReceiptNote: string;
    lfRollReceiptSave: string;
    lfRollReceiptHistory: string;
    lfRollReceiptFailed: string;
    navInkStock: string;
    inkStockTitle: string;
    inkStockIntro: string;
    inkStockSelectLine: string;
    printProcessLargeFormatRoll: string;
    printProcessUvRigid: string;
    printProcessDtfTextile: string;
    inkStockOnHand: string;
    inkStockAvgCost: string;
    inkStockNormPerSqm: string;
    inkStockNormAccountingHint: string;
    inkReceiptOpen: string;
    inkReceiptTitle: string;
    inkReceiptQtyMl: string;
    inkReceiptTotalMdl: string;
    inkReceiptDate: string;
    inkReceiptNote: string;
    inkReceiptSave: string;
    inkReceiptFailed: string;
    inkReceiptDelete: string;
    inkReceiptDeleteConfirm: string;
    inkReceiptDeleteNegative: string;
    inkReceiptHistory: string;
    inkConsumptionHistory: string;
    /** Shown under ink consumption list: "Showing 80 of 236". */
    inkConsumptionShowing: (shown: number, total: number) => string;
    inkConsumptionShowMore: string;
    lfRollConsumptionHistory: string;
    stockConsumptionEmpty: string;
    stockConsumptionKindOrderSale: string;
    stockConsumptionKindOrderReturn: string;
    stockConsumptionKindProcurementBacklog: string;
    /** Layout printed on this roll instead of the ordered one (−lm). */
    stockConsumptionKindLayoutTransferOut: string;
    /** Counterpart: lm returned to the previously charged roll (+lm). */
    stockConsumptionKindLayoutTransferBack: string;
    stockConsumptionLabelInkCost: string;
    stockConsumptionLabelInkSell: string;
    stockConsumptionLabelMaterialCost: string;
    stockConsumptionLabelMaterialSell: string;
    stockConsumptionOrderNumber: (n: number) => string;
    clientName: string;
    clientNamePlaceholder: string;
    clientPhonePlaceholder: string;
    copiesInputPlaceholder: string;
    filterAll: string;
    rowsPerPage: string;
    filterMine: string;
    filterInProgress: string;
    filterProcurementOnly: string;
    procurementTodayBanner: (count: number) => string;
    procurementBadge: string;
    procurementDetail: (requested: number, stockAtOrder: number) => string;
    procurementDetailLfRoll: (requestedLm: number, stockLm: number) => string;
    procurementDetailInk: (
      requestedMl: number,
      stockMl: number,
      processName?: string,
    ) => string;
    filterWorkshop: string;
    workshopSidebarHint: string;
    filterByStatus: string;
    filterByStatusAll: string;
    filterByDate: string;
    filterDateFrom: string;
    filterDateTo: string;
    filterDateClear: string;
    orderCreated: string;
    creatingOrder: string;
    createdByLabel: string;
    sentByLabel: string;
    editOrder: string;
    deleteOrder: string;
    deleteConfirm: string;
    deleteConfirmText: string;
    cancel: string;
    save: string;
    saving: string;
    prio: string;
    prioOn: string;
    prioOff: string;
    unreadComments: string;
    markAllRead: string;
    newCommentToast: string;
    viewComments: string;
    price: string;
    pricePlaceholder: string;
    currency: string;
    paid: string;
    unpaid: string;
    markPaid: string;
    markUnpaid: string;
    history: string;
    noHistory: string;
    historyOrderCreated: string;
    historyStatusChanged: (from: string, to: string) => string;
    historyFieldUpdated: (field: string, from: string, to: string) => string;
    historyFileAdded: (fileName: string) => string;
    historyFileRemoved: (fileName: string) => string;
    historyFileUpdated: (fileName: string) => string;
    historyFieldPrice: string;
    historyFieldPrio: string;
    historyFieldPaid: string;
    historyFieldNotes: string;
    historyFieldPhone: string;
    historyFieldClientName: string;
    historyFieldClientId: string;
    historyFieldIssueReason: string;
    historyValueTrue: string;
    historyValueFalse: string;
    historyValueEmpty: string;
    historyClient: string;
    historyOrderDeleted: string;
    historyOrderRestored: string;
    /** Top nav: invoices ("Cont spre plata"). Studio admin + superadmin. */
    navInvoices: string;
    /** Top nav: bookkeeping hub (reconciliation + e-Factura). Admin + superadmin. */
    navBookkeeping: string;
    /** Short subtitle under the bookkeeping page title. */
    bookkeepingSubtitle: string;
    /** Bookkeeping segment: bank reconciliation / debtors. */
    bookkeepingTabReconciliation: string;
    /** Bookkeeping segment: outgoing fiscal invoices (seller). */
    bookkeepingTabSales: string;
    /** Bookkeeping segment: outgoing payments / purchases (buyer). */
    bookkeepingTabPurchases: string;
    /** @deprecated Prefer bookkeepingTabSales */
    bookkeepingTabFiscal: string;
    /** Legacy label (kept for i18n reuse). */
    navReconciliation: string;
    /** Legacy label (kept for i18n reuse). */
    navFiscalInvoices: string;
    /** Top nav: supplier / outgoing payments analysis. Admin + superadmin. */
    navSuppliers: string;
    /** Top nav: app settings (supplier/company profile). Superadmin only. */
    navSettings: string;
    /** Top nav: profit / accounting analytics. Superadmin only. */
    navAccounting: string;
    navTrash: string;
    trashTitle: string;
    trashSubtitle: string;
    trashEmpty: string;
    trashInfo: string;
    trashDeletedAt: string;
    trashDeletedBy: string;
    trashDaysRemaining: string;
    trashRestore: string;
    trashRestoring: string;
    trashPermanentDelete: string;
    trashPermanentConfirmText: string;
    trashRestored: string;
    trashMoveToTrash: string;
    navUsers: string;
    usersTitle: string;
    usersSubtitle: string;
    usersAdd: string;
    usersLogin: string;
    usersDisplayName: string;
    usersRole: string;
    usersPassword: string;
    usersNewPassword: string;
    usersNewPasswordHint: string;
    usersSave: string;
    usersCreating: string;
    usersUpdating: string;
    usersEdit: string;
    usersDelete: string;
    usersDeleteConfirm: string;
    usersCannotDeleteSelf: string;
    usersNoRows: string;
  };
  statuses: {
    NEW: string;
    IN_PROGRESS: string;
    READY_IN_STUDIO: string;
    SENT_TO_WORKSHOP: string;
    WORKSHOP_PRINTING: string;
    WORKSHOP_READY: string;
    RETURNED_TO_STUDIO: string;
    DELIVERED: string;
    ISSUE: string;
  };
  clientStatuses: {
    inProgress: string;
    ready: string;
    readyInStudio: string;
    readyInWorkshop: string;
    issue: string;
  };
  track: {
    title: string;
    errorTitle: string;
    issueMessage: string;
    refresh: string;
    lastUpdated: string;
    expiredInfo: string;
    contactInfo: string;
    errorNotFound: string;
    errorExpired: string;
    newPrint: string;
  };
  mug: {
    productPaperPrint: string;
    productPaperPrintHint: string;
    productMug: string;
    mugDesignerHint: string;
    mugUploadHint: string;
    chooseProduct: string;
    chooseTemplate: string;
    uploadPhotos: string;
    addPhoto: string;
    removePhoto: string;
    photoSlot: (n: number) => string;
    addText: string;
    textPlaceholder: string;
    fontFamily: string;
    textColor: string;
    preview: string;
    rotate3d: string;
    loading3d: string;
    confirmLayout: string;
    stepTemplate: string;
    stepMug: string;
    stepCustomize: string;
    stepPreview: string;
    stepDetails: string;
    /** Compact progress subtitle, e.g. "2/6 · Mug" */
    stepProgressLine: (current: number, total: number, stepName: string) => string;
    /** Hint under the photo uploader, e.g. "Up to 3 photos". `n` is the template's `maxPhotos`. */
    maxPhotos: (n: number) => string;
    generating: string;
    templateClassic: string;
    templatePhotoTextPhoto: string;
    templatePhotoText: string;
    templateTextPhoto: string;
    templateFullOverlay: string;
    templateCollage: string;
    templatePanorama: string;
    templatePanoramaNoText: string;
    templateThreePhotos: string;
    templatePolaroidTrio: string;
    templateBigQuote: string;
    templateHeartLove: string;
    fitCover: string;
    fitContain: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    background: string;
    /** Hint shown above colour swatches when some are hidden because they match the mug body colour. */
    paletteFilteredHint: string;
    confirmHint: string;
    mugModeEditor: string;
    mugModeUpload: string;
    uploadReadyLayout: string;
    uploadLayoutHint: string;
    removeLayout: string;
    mugProductPickLabel: string;
    mugProductPickHint: string;
    mugProductCatalogEmpty: string;
    mugProductOtherLabel: string;
    mugProductOtherHint: string;
    productNotebook: string;
  };
  notebook: {
    productNotebook: string;
    notebookDesignerHint: string;
    notebookUploadHint: string;
    chooseTemplate: string;
    uploadPhotos: string;
    addPhoto: string;
    removePhoto: string;
    photoSlot: (n: number) => string;
    addText: string;
    textPlaceholder: string;
    fontFamily: string;
    textColor: string;
    preview: string;
    rotate3d: string;
    loading3d: string;
    confirmLayout: string;
    stepTemplate: string;
    stepNotebook: string;
    stepCustomize: string;
    stepPreview: string;
    stepDetails: string;
    stepProgressLine: (current: number, total: number, stepName: string) => string;
    /** Hint under the photo uploader, e.g. "Up to 3 photos". `n` is the template's `maxPhotos`. */
    maxPhotos: (n: number) => string;
    generating: string;
    templateClassic: string;
    templatePhotoTextPhoto: string;
    templatePhotoText: string;
    templateTextPhoto: string;
    templatePanorama: string;
    templateThreePhotos: string;
    templatePolaroidTrio: string;
    templateBigQuote: string;
    templateHeartLove: string;
    templateCollage: string;
    templateSplitHorizontal: string;
    templateGridQuad: string;
    fitCover: string;
    fitContain: string;
    background: string;
    /** Hint shown above colour swatches when some are hidden because they match the notebook cover colour. */
    paletteFilteredHint: string;
    confirmHint: string;
    notebookModeEditor: string;
    notebookModeUpload: string;
    uploadReadyLayout: string;
    uploadLayoutHint: string;
    removeLayout: string;
    notebookProductPickLabel: string;
    notebookProductPickHint: string;
    notebookProductCatalogEmpty: string;
    notebookProductOtherLabel: string;
    notebookProductOtherHint: string;
  };
  approve: {
    title: string;
    subtitle: string;
    approveButton: string;
    requestChangesButton: string;
    feedbackPlaceholder: string;
    feedbackLabel: string;
    sendFeedback: string;
    approvedTitle: string;
    approvedMessage: string;
    changesRequestedTitle: string;
    changesRequestedMessage: string;
    alreadyApproved: string;
    alreadyRequested: string;
    editMugLayout: string;
    editNotebookLayout: string;
    clientFeedback: string;
    preview2d: string;
    preview3d: string;
  };
  login: {
    title: string;
    nameLabel: string;
    namePlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    submitButton: string;
    loggingIn: string;
    error: string;
    errorServer: string;
    logout: string;
  };
  productPicker: {
    /** Placeholder for the search input above the product grid */
    searchPlaceholder: string;
    /** Shown when search/filter yields no results */
    noResults: string;
    /** Section heading when picking a product (step 1 of the picker) */
    pickProduct: string;
    /** Section heading when picking a mode (step 2 of the picker) */
    pickMode: string;
    /** Back button label between mode-step and product-step */
    back: string;
  };
  /** Customer-portal (личный кабинет) UI. */
  cabinet: {
    headerTitle: string;
    navOrders: string;
    navProfile: string;
    navNewOrder: string;
    /** Cabinet nav: invoices list (read-only). */
    navInvoices: string;
    /** Cabinet invoices (read-only). */
    invoices: {
      pageTitle: string;
      pageSubtitle: string;
      empty: string;
      colNumber: string;
      colDate: string;
      colAmount: string;
      colStatus: string;
      colValidUntil: string;
      statusIssued: string;
      statusPaid: string;
      statusCancelled: string;
      statusExpired: string;
      detailTitle: (n: string) => string;
      detailBack: string;
      detailDownloadPdf: string;
      detailNotPaidHint: string;
      detailPaidHint: string;
      detailCancelledHint: string;
    };
    logout: string;
    dealerBadge: string;
    /** "Welcome, X" greeting on the dashboard. */
    welcome: (name: string) => string;
    ordersTitle: string;
    ordersSubtitle: string;
    ordersEmpty: string;
    ordersEmptyHint: string;
    ordersStartNew: string;
    /** Compact "+ Comandă" button used in the orders header (desktop + mobile FAB). */
    newOrderButton: string;
    /** Counter shown below the orders title, e.g. "3 orders". */
    ordersCount: (n: number) => string;
    orderProductPaper: string;
    orderProductMug: string;
    orderProductNotebook: string;
    orderProductLargeFormat: string;
    /** Table column headers for the desktop orders list view. */
    ordersColStatus: string;
    ordersColNumber: string;
    ordersColDate: string;
    ordersColProduct: string;
    ordersColFiles: string;
    ordersColAmount: string;
    /** "Amount due" summary above the orders table. */
    amountDue: string;
    amountDuePaidAll: string;
    amountDueUnpaidCount: (n: number) => string;
    /** Filter strings used in the orders list toolbar. */
    ordersFilterAllStatuses: string;
    ordersFilterClear: string;
    ordersSearchPlaceholder: string;
    ordersNoMatches: string;
    orderCreatedAt: string;
    orderPrice: string;
    orderPaid: string;
    orderUnpaid: string;
    orderViewDetails: string;
    orderDetailTitle: (n: number) => string;
    orderDetailFiles: string;
    orderDetailNotes: string;
    orderDetailBack: string;
    orderDetailNoFiles: string;
    /** Client <-> studio message thread on the order detail screen. */
    orderDetailMessages: string;
    messagesEmpty: string;
    messagePlaceholder: string;
    messageSend: string;
    messageSending: string;
    messagesYou: string;
    messagesStudio: string;
    messageEdited: string;
    /** Toast + badge for new unread studio messages in the cabinet. */
    newMessageToast: string;
    unreadMessages: string;
    /** Per-file action buttons on the cabinet order detail screen. */
    orderFilePreview: string;
    orderFileDownload: string;
    orderFileClose: string;
    /** Hint shown in preview modal for non-image, non-PDF files. */
    orderFilePreviewUnavailable: string;
    /** Plural-ish "X pages" / "× N copies" used in file meta line. */
    orderFilePages: (n: number) => string;
    orderFileCopies: (n: number) => string;
    /** Layout preview heading on the order detail screen (mug/notebook). */
    orderDetailLayout: string;
    profileTitle: string;
    profileSubtitle: string;
    profilePhone: string;
    profilePhoneLocked: string;
    profilePersonName: string;
    profileCompanyName: string;
    profileCompanyIdno: string;
    profileEmail: string;
    profileNewPassword: string;
    profileNewPasswordHint: string;
    profileSave: string;
    profileSaving: string;
    profileSaved: string;
    profileSaveFailed: string;
    /** Banner shown to dealers across the cabinet so they know prices are wholesale. */
    dealerPricingBanner: string;
    /** Placeholder cards on the orders dashboard. */
    productLinks: {
      title: string;
      paper: string;
      mug: string;
      notebook: string;
    };
    /** Dedicated /cabinet/orders/new page. */
    newOrder: {
      title: string;
      subtitle: string;
      backToOrders: string;
      paperTitle: string;
      paperDescription: string;
      mugTitle: string;
      mugDescription: string;
      notebookTitle: string;
      notebookDescription: string;
      cta: string;
      /** Compact product type tabs at the top of the wide form. */
      tabPaper: string;
      tabMug: string;
      tabNotebook: string;
      /** Large-format (wide-format roll printing) tab + section. */
      tabLargeFormat: string;
      lfMaterialLabel: string;
      lfSizeLabel: string;
      /** "Custom size" chip shown alongside the material's size presets. */
      lfPresetCustom: string;
      lfWidthLabel: string;
      lfHeightLabel: string;
      lfQuantityLabel: string;
      /** Final price block heading. */
      lfEstimatedPrice: string;
      /** Suffix for a per-linear-meter rate, e.g. "240 MDL / m". */
      lfPerLinearMeter: string;
      /** Linear meters consumed, e.g. "≈ 1.8 m of roll". */
      lfLinearMeters: (meters: number) => string;
      /** Roll-pack diagram heading + empty hint. */
      lfPreviewTitle: string;
      lfPreviewEmpty: string;
      /** Validation / pricing errors surfaced inline. */
      lfDoesNotFit: string;
      lfQuantityTooLarge: string;
      lfRequiresLogin: string;
      /** Tier pills next to the price. */
      lfTierRetail: string;
      lfTierDealer: string;
      /** File picker for the print-ready artwork. */
      lfUploadLabel: string;
      lfUploadHint: string;
      lfFileChosen: (name: string) => string;
      /** Shown while there are no active large-format materials. */
      lfNoMaterials: string;
      /** Notes textarea (optional). */
      notesLabel: string;
      notesPlaceholder: string;
      /** Banner above the form: "Sending order as Victoria · +373..." */
      sendingAs: (name: string) => string;
      /** Button labels. */
      submit: string;
      submitting: string;
      /** Generic submit failure. */
      submitFailed: string;
      /** Stock conflict from POST /api/orders (mug/notebook). */
      stockInsufficient: (requested: number, available: number) => string;
    };
  };
  /** Customer-portal authentication screens. */
  cabinetAuth: {
    loginTitle: string;
    loginSubtitle: string;
    loginPhoneLabel: string;
    loginPasswordLabel: string;
    loginSubmit: string;
    loginSubmitting: string;
    loginError: string;
    noAccount: string;
    goToRegister: string;
    registerTitle: string;
    registerSubtitle: string;
    registerKindIndividual: string;
    registerKindLegal: string;
    registerPhoneLabel: string;
    registerPasswordLabel: string;
    registerPasswordHint: string;
    registerNameLabel: string;
    registerCompanyLabel: string;
    registerIdnoLabel: string;
    registerEmailLabel: string;
    registerSubmit: string;
    registerSubmitting: string;
    registerError: string;
    registerDuplicate: string;
    haveAccount: string;
    goToLogin: string;
    /** Button label of the standalone CTA at the bottom of public landing pages. */
    publicCtaButton: string;
    /** Discreet toggle shown under the client form to reveal the staff form. */
    staffToggle: string;
    /** Toggle shown under the staff form to return to the client form. */
    clientToggle: string;
  };
  /** Tier-aware pricing labels (used both in cabinet and in editors). */
  pricing: {
    retailTier: string;
    dealerTier: string;
    /** Compact pill near a price, e.g. "Dealer". */
    tierBadgeRetail: string;
    tierBadgeDealer: string;
  };
  /** Admin invoices ("Cont spre plata") page + workflow. */
  invoices: {
    pageTitle: string;
    pageSubtitle: string;
    newButton: string;
    backToList: string;
    listLoading: string;
    listEmpty: string;
    listEmptyHint: string;
    colNumber: string;
    colDate: string;
    colClient: string;
    colStatus: string;
    colAmount: string;
    colValidUntil: string;
    colCreatedBy: string;
    createdByUnknown: string;
    statusDraft: string;
    statusIssued: string;
    statusPaid: string;
    statusCancelled: string;
    statusExpired: string;
    filterStatus: string;
    filterStatusAll: string;
    filterClient: string;
    filterDateFrom: string;
    filterDateTo: string;
    filterClear: string;
    filterAuthor: string;
    filterAuthorAll: string;
    filterAuthorMine: string;
    searchPlaceholder: string;
    newTitle: string;
    payerSection: string;
    payerSelect: string;
    payerSelected: string;
    payerCreate: string;
    payerCreated: string;
    payerCompanyHint: string;
    payerIndividualHint: string;
    payerMissingFields: string;
    itemsSection: string;
    itemsAddLine: string;
    itemsAddFromOrder: string;
    itemsHeaderArticle: string;
    itemsHeaderQty: string;
    itemsHeaderUnit: string;
    itemsHeaderPrice: string;
    itemsHeaderTotal: string;
    itemsRemove: string;
    itemsLinkedOrder: (n: number) => string;
    itemsUnitDefault: string;
    itemsDescriptionPlaceholder: string;
    paramsSection: string;
    paramIssueDate: string;
    paramValidityDays: string;
    paramLocale: string;
    paramNotes: string;
    notesPlaceholder: string;
    totalsSection: string;
    totalSubtotal: string;
    totalVat: string;
    totalDue: string;
    saveDraft: string;
    saveChanges: string;
    saving: string;
    savedDraft: string;
    saveFailed: string;
    issueAndDownload: string;
    issuing: string;
    issuedSuccess: string;
    issueFailed: string;
    detailIssue: string;
    detailMarkPaid: string;
    detailMarkUnpaid: string;
    detailCancel: string;
    detailDownloadPdf: string;
    detailEdit: string;
    detailDelete: string;
    detailHistory: string;
    detailHistoryCreated: string;
    detailHistoryCreatedBy: (name: string) => string;
    detailHistoryIssued: string;
    detailHistoryPaid: string;
    detailHistoryCancelled: string;
    detailValidUntil: string;
    detailExpired: string;
    detailLinkedOrder: (n: number) => string;
    detailLinkedOrderOpen: string;
    detailNoLines: string;
    markPaidTitle: string;
    markPaidNoteLabel: string;
    markPaidNotePlaceholder: string;
    markPaidConfirm: string;
    markUnpaidTitle: string;
    markUnpaidBody: string;
    markUnpaidConfirm: string;
    editTitle: string;
    cancelTitle: string;
    cancelReasonLabel: string;
    cancelReasonPlaceholder: string;
    cancelConfirm: string;
    deleteTitle: string;
    deleteBody: string;
    deleteConfirm: string;
    fromOrderTitle: string;
    fromOrderHint: string;
    fromOrderEmpty: string;
    fromOrderSelectClientFirst: string;
    fromOrderAdd: string;
    /** Badge shown on the order detail/list when an order is referenced by an invoice. */
    orderInvoiceBadge: (number: string) => string;
    errorClientRequired: string;
    errorLineItemsRequired: string;
    errorInvalidStatus: string;
    issuedAtLabel: string;
    paidAtLabel: string;
    cancelledAtLabel: string;
    paidNoteLabel: string;
    cancelReasonShownLabel: string;
    /** Section header on client modal/page showing recent invoices. */
    clientHistoryTitle: string;
    clientHistoryEmpty: string;
    clientHistoryNew: string;
    /** Top of /admin/orders/[id] when an order is linked to one or more invoices. */
    orderLinkedInvoicesTitle: string;
  };
  /** Static labels printed on the generated invoice PDF. */
  pdfInvoice: {
    heading: string;
    supplier: string;
    payer: string;
    date: string;
    invoiceNo: string;
    fiscalCode: string;
    address: string;
    iban: string;
    bank: string;
    bic: string;
    article: string;
    qty: string;
    priceInclVat: string;
    total: string;
    includingVat: string;
    totalDue: string;
    validity: (days: number) => string;
    director: string;
    chiefAccountant: string;
    unitBuc: string;
  };
  /** Supplier / company profile settings (superadmin). */
  settings: {
    pageTitle: string;
    pageSubtitle: string;
    saveButton: string;
    saving: string;
    saved: string;
    saveFailed: string;
    saveProductionPartialFailed: string;
    sectionCompany: string;
    sectionBank: string;
    sectionInvoice: string;
    sectionSignatures: string;
    /** Customer-portal CTA on public landing pages. */
    sectionPublicSite: string;
    fieldShowCabinetLoginCta: string;
    fieldShowCabinetLoginCtaHint: string;
    /** Small caption above the hint paragraph in the public-site section. */
    fieldShowCabinetLoginCtaHintTitle: string;
    fieldShowCabinetLoginCtaOn: string;
    fieldShowCabinetLoginCtaOff: string;
    fieldName: string;
    fieldFiscalCode: string;
    fieldAddress: string;
    fieldIban: string;
    fieldBankName: string;
    fieldBic: string;
    fieldDirectorName: string;
    fieldAccountantName: string;
    fieldVatRate: string;
    fieldVatRateHint: string;
    fieldInvoiceValidityDays: string;
    fieldInvoiceNumberPadding: string;
    fieldDefaultLocale: string;
    fieldCurrency: string;
    fieldLogoPath: string;
    fieldLogoPathHint: string;
    logoUploadButton: string;
    logoRemoveButton: string;
    logoUploading: string;
    logoUploadFailed: string;
    fieldLogoOptionalUrl: string;
    /** Production economics (same API as accounting settings). */
    productionSectionTitle: string;
    productionSectionGeneral: string;
    productionSectionLf: string;
    productionSectionUv: string;
    productionSectionDtf: string;
    nextInvoiceNumber: (n: string) => string;
  };
  /** Superadmin accounting / profit analytics. */
  accounting: {
    pageTitle: string;
    pageSubtitle: string;
    presetToday: string;
    presetYesterday: string;
    presetThisWeek: string;
    presetThisMonth: string;
    loadError: string;
    loading: string;
    ordersEmpty: string;
    allocationNote: string;
    summaryRevenue: string;
    summaryNetProfit: string;
    summaryProductCost: string;
    summaryProductionCost: string;
    summaryTaxes: string;
    summaryOverhead: string;
    summaryMargin: string;
    colOrder: string;
    colDate: string;
    colCustomer: string;
    colRevenue: string;
    colProductCost: string;
    colProductionCost: string;
    colTaxes: string;
    colOverhead: string;
    colNetProfit: string;
    colMargin: string;
    missingCostBadge: string;
    breakdownTitle: (orderNum: number) => string;
    breakdownClose: string;
    breakdownRevenue: string;
    breakdownProductCost: string;
    breakdownProduction: string;
    breakdownOverhead: string;
    breakdownTaxes: string;
    breakdownNet: string;
    breakdownMargin: string;
    sectionProduction: string;
    sectionExpenses: string;
    productionMugPrint: string;
    productionNotebookPrint: string;
    productionPackaging: string;
    productionOther: string;
    productionInkMlPerSqmLf: string;
    productionInkMlPerSqmUv: string;
    productionInkMlPerSqmDtf: string;
    productionMinimumOrderPrice: string;
    productionLfRetailMarkupMultiplier: string;
    productionLfDealerMarkupMultiplier: string;
    /** LF roll: ink sell ≈ ink COGS × multiplier (retail tier). */
    productionLfInkRetailMarkupMultiplier: string;
    /** LF roll: ink sell ≈ ink COGS × multiplier (dealer tier). */
    productionLfInkDealerMarkupMultiplier: string;
    productionLfInkMarkupMultiplierHint: string;
    /** Min sell total applied per large-format order line, retail only (0 = none). */
    productionLfMinimumLineTotalMdl: string;
    saveProduction: string;
    savingProduction: string;
    savedProduction: string;
    saveProductionFailed: string;
    expensesTitle: string;
    expensesAdd: string;
    expensesEdit: string;
    expensesDelete: string;
    expensesConfirmDelete: string;
    expensesName: string;
    expensesType: string;
    expensesAmount: string;
    expensesPeriod: string;
    expensesStart: string;
    expensesEnd: string;
    expensesActive: string;
    expensesNotes: string;
    expensesSave: string;
    expensesSaving: string;
    expensesEmpty: string;
    expenseTypeRent: string;
    expenseTypeTax: string;
    expenseTypeEquipmentDepreciation: string;
    expenseTypeConsumables: string;
    expenseTypeElectricity: string;
    expenseTypeOther: string;
    expensePeriodDaily: string;
    expensePeriodMonthly: string;
    expensePeriodYearly: string;
    expensePeriodOneTime: string;
    expensesAccruedInRange: string;
    yes: string;
    no: string;
    invalidAmount: string;
  };
  /**
   * Small badge next to an order file showing how much of its R2 lifecycle
   * window is left. See `src/lib/orderFileLifecycle.ts`.
   */
  fileLifecycle: {
    /** Storage lifecycle has elapsed — file is no longer downloadable. */
    expired: string;
    /** Less than 24 hours remaining. */
    expiresToday: string;
    /** Whole days remaining (>=1). Locales apply their own pluralisation. */
    daysLeft: (days: number) => string;
  };
  /** Workshop board dashboard strings (`/admin/workshop-board`). */
  workshopBoard: {
    title: string;
    navLink: string;
    refresh: string;
    emptyBoard: string;
    emptySection: string;
    /** Section header labels by product type. */
    sectionLf: string;
    sectionMug: string;
    sectionNotebook: string;
    sectionPaper: string;
    /** Aggregate badges on group headers. */
    groupLinesCount: (n: number) => string;
    groupOrdersCount: (n: number) => string;
    groupTotalQty: (n: number) => string;
    groupTotalLm: (m: number) => string;
    rollWidth: (m: string) => string;
    /** Filter: show RETURNED + DELIVERED in addition to active pipeline */
    includeDelivered: string;
    /** Phase 2 placeholder button on LF group header */
    assembleLayoutCta: string;
    assembleLayoutCtaSoon: string;
    /** Paper group label components */
    paperColorLabel: string;
    paperBwLabel: string;
    paperMixedLabel: string;
    /** Layout planner modal */
    layoutModalTitle: (materialName: string) => string;
    layoutPrintableWidth: (cm: number) => string;
    layoutGap: (cm: number) => string;
    layoutCurrentLength: (m: number) => string;
    layoutNaiveLength: (m: number) => string;
    layoutSaved: (m: number, pct: number) => string;
    layoutUnplaced: (n: number) => string;
    layoutClose: string;
    layoutTilesCount: (n: number) => string;
    /** Shown when a material (e.g. BANNER MATT) prints a blank margin per piece. */
    layoutWhiteBorder: (cm: number) => string;
    /** Shown for canvas: a mirrored gallery-wrap margin is added on every side. */
    layoutGalleryWrap: (cm: number) => string;
    layoutDownloadPdf: string;
    layoutGeneratingPdf: string;
    layoutPdfError: string;
    layoutPdfUnplacedBlocked: string;
    /** Line selection panel inside the layout planner modal. */
    layoutLinesTitle: (selected: number, total: number) => string;
    layoutSelectAll: string;
    layoutDeselectAll: string;
    layoutNoLinesSelected: string;
    /** Checkbox toggling the white border (e.g. BANNER MATT 4 cm) on/off. */
    layoutIncludeBorder: (cm: number) => string;
    /** Hint under the SVG: click a tile to rotate or undo. */
    layoutRotateHint: string;
    /** Clears all manual orientation pins and re-packs. */
    layoutResetPins: string;
    /** Roll picker (families with several roll widths, e.g. ORACAL MATT). */
    layoutRollPickerTitle: string;
    /** Per-roll line: layout length (m) and material cost (MDL). */
    layoutRollCost: (m: number, mdl: number) => string;
    /** Badge on the cheapest fitting roll. */
    layoutRollBest: string;
    /** Savings of the recommended roll vs the next fitting alternative. */
    layoutRollSavings: (mdl: number) => string;
    /** Roll whose printable width cannot fit every selected tile. */
    layoutRollDoesNotFit: string;
    /** Roll stock is below the length this layout consumes. */
    layoutRollLowStock: (availableLm: number) => string;
    /** Board card hint: printing the whole group on `name` saves `mdl` MDL. */
    groupCheaperRollHint: (name: string, mdl: number) => string;
    /** Confirm-print button: moves stock write-off onto the selected roll. */
    layoutConfirmRollCta: string;
    layoutConfirmRollBusy: string;
    /** Result: `moved` lines transferred, `skipped` already on this roll. */
    layoutConfirmRollDone: (moved: number, skipped: number) => string;
    layoutConfirmRollError: string;
    /** Warning appended when the target roll balance went below zero. */
    layoutConfirmRollNegativeStock: (name: string) => string;
  };
}
