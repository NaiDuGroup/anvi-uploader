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
    navPrimaryAriaLabel: string;
    appShellSubtitle: string;
    clientPickerLabel: string;
    clientPickerNone: string;
    clientPickerClear: string;
    clientPickerSearch: string;
    clientPickerEmpty: string;
    orderClientFromRegistryLockedHint: string;
    orderStudioClient: string;
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
    clientsCompanyIban: string;
    clientsEdit: string;
    clientsDelete: string;
    clientsSave: string;
    clientsCreating: string;
    clientsUpdating: string;
    clientsNoRows: string;
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
    loggedInAs: string;
    roleAdmin: string;
    roleSuperAdmin: string;
    roleWorkshop: string;
    newOrder: string;
    createOrder: string;
    /** Wizard page strings (`/admin/orders/new`) */
    newOrderPage: {
      title: string;
      stepProductLabel: string;
      stepModeLabel: string;
      stepDesignLabel: string;
      stepClientLabel: string;
      stepConfirmLabel: string;
      stepIndicator: (current: number, total: number) => string;
      cancel: string;
      next: string;
      back: string;
      createSuccess: string;
      confirmTitle: string;
      confirmHint: string;
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
    mugCatalogColDealerPrice: string;
    mugCatalogOpenEdit: string;
    mugCatalogCopy: string;
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
    notebookCatalogColDealerPrice: string;
    notebookCatalogOpenEdit: string;
    notebookCatalogCopy: string;
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
    clientName: string;
    clientNamePlaceholder: string;
    clientPhonePlaceholder: string;
    copiesInputPlaceholder: string;
    filterAll: string;
    rowsPerPage: string;
    filterMine: string;
    filterInProgress: string;
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
    /** Top nav: app settings (supplier/company profile). Superadmin only. */
    navSettings: string;
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
    PENDING_APPROVAL: string;
    CHANGES_REQUESTED: string;
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
    issue: string;
    pendingApproval: string;
    changesRequested: string;
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
    maxPhotos: string;
    generating: string;
    templateClassic: string;
    templatePhotoTextPhoto: string;
    templatePhotoText: string;
    templateTextPhoto: string;
    templateFullOverlay: string;
    templateCollage: string;
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
    maxPhotos: string;
    generating: string;
    templateClassic: string;
    templatePhotoTextPhoto: string;
    templatePhotoText: string;
    templateTextPhoto: string;
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
    copyApprovalLink: string;
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
    /** Layout preview heading on the order detail screen (mug/notebook). */
    orderDetailLayout: string;
    profileTitle: string;
    profileSubtitle: string;
    profilePhone: string;
    profilePhoneLocked: string;
    profilePersonName: string;
    profileCompanyName: string;
    profileCompanyIdno: string;
    profileCompanyIban: string;
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
    registerIbanLabel: string;
    registerEmailLabel: string;
    registerSubmit: string;
    registerSubmitting: string;
    registerError: string;
    registerDuplicate: string;
    haveAccount: string;
    goToLogin: string;
    /** Button label of the standalone CTA at the bottom of public landing pages. */
    publicCtaButton: string;
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
    saving: string;
    savedDraft: string;
    saveFailed: string;
    issueAndDownload: string;
    issuing: string;
    issuedSuccess: string;
    issueFailed: string;
    detailIssue: string;
    detailMarkPaid: string;
    detailCancel: string;
    detailDownloadPdf: string;
    detailEdit: string;
    detailDelete: string;
    detailHistory: string;
    detailHistoryCreated: string;
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
    sectionCompany: string;
    sectionBank: string;
    sectionInvoice: string;
    sectionSignatures: string;
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
    nextInvoiceNumber: (n: string) => string;
  };
}
