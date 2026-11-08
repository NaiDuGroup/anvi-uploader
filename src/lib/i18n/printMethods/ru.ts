import type { PrintMethodsDictionary } from "./types";

export const printMethodsRu: PrintMethodsDictionary = {
  loading: "Загрузка…",
  loadFailed: "Не удалось загрузить данные",
  save: "Сохранить",
  saving: "Сохранение…",
  saved: "Сохранено",
  presetLabel: "Название",
  presetWidth: "Ширина, см",
  presetHeight: "Высота, см",
  presetRetail: "Цена, лей",
  presetDealer: "Дилер, лей",
  presetDealerNoPress: "Дилер без прессовки, лей",
  presetActive: "Активен",
  presetInvalid: "Укажите название, ширину, высоту и цену формата",
  addPreset: "Добавить формат",
  deletePreset: "Удалить",
  confirmDeletePreset: (label) => `Удалить формат «${label}»? Старые заказы не изменятся.`,
  confirmDeletePresetTitle: "Удалить формат?",
  fieldInvalid: (label) => `Проверьте поле «${label}»`,
  units: {
    cm: "см",
    mm: "мм",
    ml: "мл",
    ml_per_sqm: "мл/м²",
    ml_per_m: "мл/пог. м",
    g_per_m: "г/пог. м",
    pct: "%",
    mdl: "лей",
    mdl_per_sqm: "лей/м²",
    mdl_per_m: "лей/м",
    pcs: "шт",
  },
  methods: {
    dtf: {
      title: "DTF: прайс и нормы",
      subtitle:
        "Вещь со склада + принт по прайсу (майка 100 + A4 180 = 280). Кепки и носки продаются комплектом: логотип (кепка до 5×9, носки до 10×10) уже в цене, другой размер — плюс разница по прайсу (меняется в карточке изделия). Розница со скидкой за тираж, дилер — по своей цене. Нормы — для себестоимости.",
      presetsTitle: "Форматы трансфера",
      presetsHint: "Цена одного принта с прессовкой. «Дилер без прессовки» — запечённый трансфер без переноса (только дилерам, только на вещи клиента).",
      settingsTitle: "Скидки, минимумы и нормы расхода",
    },
    uv: {
      title: "UV: цены и нормы",
      subtitle:
        "Цена печати — от параметров: площадь зоны × ставка за м², не ниже минимума за зону. Основная печать на изделии со склада входит в его цену. Чернила и лак — у UV-принтера («Принтеры»).",
      presetsTitle: "",
      presetsHint: "",
      settingsTitle: "Цены печати, доплаты и нормы расхода",
    },
    sublimation: {
      title: "Сублимация: нормы расхода",
      subtitle:
        "Расход Epson L1800 на одно изделие: сублимационная бумага, термоскотч и чернила. Цена — за штуку по тиражным ступеням изделия на складе; прайса форматов нет.",
      presetsTitle: "",
      presetsHint: "",
      settingsTitle: "Потери",
    },
  },
  fields: {
    dtf: {
      filmWidthCm: { label: "Ширина плёнки" },
      printableWidthCm: { label: "Печатная ширина" },
      gapCm: { label: "Отступ между макетами" },
      layoutGapMm: { label: "Зазор на плёнке в цехе", hint: "Раскладка в доске цеха: расстояние между реальными контурами рисунков. Прозрачные поля файла не учитываются." },
      whiteChokeMm: { label: "Поджатие белой плашки", hint: "Белый канал «White» чуть меньше рисунка, чтобы не вылезал по краю." },
      inkMlPerLinearMeter: { label: "Чернила на погонный метр" },
      powderGramsPerLinearMeter: { label: "Порошок на погонный метр" },
      runDiscount1MinQty: {
        label: "Скидка за тираж 1: от",
        hint: "Розница, один макет на все штуки. 0 шт — ступень выключена.",
      },
      runDiscount1Pct: { label: "Скидка 1" },
      runDiscount2MinQty: { label: "Скидка за тираж 2: от" },
      runDiscount2Pct: { label: "Скидка 2" },
      runDiscount3MinQty: { label: "Скидка за тираж 3: от" },
      runDiscount3Pct: { label: "Скидка 3" },
      runDiscountRoundToMdl: {
        label: "Округлять цену со скидкой до",
        hint: "Например 5 лей: 167,40 → 165. Дилерам скидки нет — у них своя цена формата.",
      },
      minimumPrintOnlyRetailMdl: {
        label: "Минимум «только печать», розница",
        hint: "Печать на вещи клиента или без вещи: строка не дешевле этой суммы.",
      },
      minimumPrintOnlyDealerMdl: { label: "Минимум «только печать», дилер" },
      pressFeePerZoneMdl: { label: "Доплата за прессовку зоны" },
      minimumLineTotalMdl: { label: "Минимальная сумма строки" },
    },
    uv: {
      retailPricePerSqmMdl: {
        label: "Цена печати за м², розница",
        hint: "Для изделия клиента и дополнительных зон: ширина × высота зоны × эта ставка.",
      },
      uvDtfRetailPerMeterMdl: {
        label: "UV-DTF: цена за погонный метр, розница",
        hint: "Плёнка шириной 30 см; наклейки раскладываются автоматически. A3 ≈ 0,42 м.",
      },
      uvDtfDealerPerMeterMdl: {
        label: "UV-DTF: цена за погонный метр, дилер",
        hint: "Для дилеров.",
      },
      uvDtfMinimumRetailMdl: {
        label: "UV-DTF: минимум строки, розница",
        hint: "Наклейки и изделие клиента. Наши изделия (кружки) — по цене изделия.",
      },
      uvDtfMinimumDealerMdl: {
        label: "UV-DTF: минимум строки, дилер",
        hint: "Для дилеров.",
      },
      uvDtfPrintableWidthCm: {
        label: "UV-DTF: рабочая ширина плёнки",
        hint: "Рулон 32 см печатает 30 см.",
      },
      uvDtfGapCm: {
        label: "UV-DTF: отступ между наклейками",
        hint: "Для резки.",
      },
      uvDtfRoundToMdl: {
        label: "UV-DTF: округление цены",
        hint: "Цена за метры округляется до этого значения. 0 — без округления.",
      },
      dealerPricePerSqmMdl: {
        label: "Цена печати за м², дилер",
        hint: "Ставка для дилеров; 0 — дилеры платят по минимуму за зону.",
      },
      minimumZonePriceRetailMdl: {
        label: "Минимум за зону, розница",
        hint: "Маленькая печать (надпись на ручке) стоит не меньше — на позиционирование каждого изделия.",
      },
      minimumZonePriceDealerMdl: {
        label: "Минимум за зону, дилер",
        hint: "Минимум за зону для дилеров.",
      },
      cmykMlPerSqm: {
        label: "Цветные чернила CMYK",
        hint: "Расход на 1 м² принта при сплошной заливке.",
      },
      whiteMlPerSqmPerLayer: {
        label: "Подложка (белый), за слой",
        hint: "Белый слой под цветом на тёмных и прозрачных изделиях; умножается на число слоёв.",
      },
      varnishMlPerSqmPerLayer: {
        label: "Лак, за слой",
        hint: "Глянец или рельеф поверх цвета; умножается на число слоёв.",
      },
      primerMlPerSqm: {
        label: "Праймер",
        hint: "Наносится вручную перед печатью (металл, стекло, пластик) на 1 м² зоны; списывается со склада (INK-UV-PRIMER).",
      },
      wastePct: {
        label: "Потери на прочистку",
        hint: "Прочистки и промывки голов — добавляются к расходу чернил.",
      },
      whiteLayerSurchargePct: {
        label: "Доплата за подложку",
        hint: "К цене печати зоны за каждый слой подложки сверх первого: один слой входит в цену. 0 — без доплаты.",
      },
      varnishSurchargePct: {
        label: "Доплата за лак",
        hint: "К цене печати зоны, если печатается лак. 0 — входит в цену.",
      },
      primerSurchargePct: {
        label: "Доплата за праймер",
        hint: "К цене печати зоны, если она грунтуется праймером. 0 — без доплаты.",
      },
      clientItemSetupFeeMdl: {
        label: "Наладка на изделие клиента",
        hint: "Один раз на строку: настройка стола, пробный оттиск. 0 — без доплаты.",
      },
      minimumLineTotalMdl: {
        label: "Минимальная сумма строки",
        hint: "Сумма UV-строки поднимается до этого значения. 0 — без минимума.",
      },
    },
    sublimation: {
      wastePct: {
        label: "Потери",
        hint: "Брак и прочистки — добавляются к нормам бумаги, скотча и чернил.",
      },
    },
  },
  norms: {
    title: "Нормы на одно изделие",
    hint: "Для каждой категории с отметкой «Сублимация». 0 — ничего не списывается. Кружки списывают по строке «Кружки».",
    colCategory: "Категория",
    colPaper: "Бумага",
    colTape: "Термоскотч",
    colInk: "Чернила",
    unitSheets: "лист.",
    unitCm: "см",
    unitMl: "мл",
    empty: "Нет категорий с отметкой «Сублимация».",
    categoriesLink: "Категории склада",
    printerLink: "Epson L1800 на странице «Принтеры»",
    clientItemTitle: "Изделие клиента: цены",
    clientItemHint:
      "Клиент приносит своё изделие — со склада ничего не берётся. Цена за шт. = площадь печати × ставка за м², не ниже минимума; плюс наладка один раз на строку; строка поднимается до минимума. 0 в ставке и минимуме — цена не задана.",
    clientItemFields: {
      retailPricePerSqmMdl: { label: "Ставка за м², розница" },
      dealerPricePerSqmMdl: { label: "Ставка за м², дилер" },
      minimumPriceRetailMdl: { label: "Минимум за шт., розница" },
      minimumPriceDealerMdl: { label: "Минимум за шт., дилер" },
      setupFeeMdl: { label: "Наладка на строку", hint: "Один раз на строку с изделием клиента. 0 — без доплаты." },
      minimumLineTotalMdl: { label: "Минимальная сумма строки", hint: "0 — без минимума." },
      inkMlPerSqm: { label: "Чернила на м² печати" },
      tapeCmPerPiece: { label: "Термоскотч на шт." },
    },
  },
};
