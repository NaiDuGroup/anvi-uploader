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
  presetActive: "Активен",
  presetInvalid: "Укажите название, ширину, высоту и цену формата",
  addPreset: "Добавить формат",
  deletePreset: "Удалить",
  confirmDeletePreset: (label) => `Удалить формат «${label}»? Старые заказы не изменятся.`,
  fieldInvalid: (label) => `Проверьте поле «${label}»`,
  units: {
    cm: "см",
    ml: "мл",
    ml_per_sqm: "мл/м²",
    ml_per_m: "мл/пог. м",
    g_per_m: "г/пог. м",
    pct: "%",
    mdl: "лей",
  },
  methods: {
    dtf: {
      subtitle:
        "Цены за размер принта, печать в цене изделия и нормы расхода плёнки, чернил и порошка. Изделия — в категориях склада, расходники — у DTF-принтера.",
      presetsTitle: "Форматы трансфера",
      presetsHint: "Цена одного отпечатка на изделии клиента или дополнительной зоны.",
      settingsTitle: "Плёнка и нормы расхода",
    },
    uv: {
      subtitle:
        "Цены за размер принта, доплаты за белила и лак, нормы расхода чернил. Чернила и лак — у UV-принтера («Принтеры»).",
      presetsTitle: "Форматы печати",
      presetsHint: "Цена одного отпечатка по размеру принта — для изделия клиента или со склада.",
      settingsTitle: "Нормы расхода и доплаты",
    },
  },
  fields: {
    dtf: {
      filmWidthCm: { label: "Ширина плёнки" },
      printableWidthCm: { label: "Печатная ширина" },
      gapCm: { label: "Отступ между макетами" },
      inkMlPerLinearMeter: { label: "Чернила на погонный метр" },
      powderGramsPerLinearMeter: { label: "Порошок на погонный метр" },
      includedPrintCreditMdl: {
        label: "Печать, включённая в цену изделия",
        hint: "Цена футболки уже содержит одну печать до A4 (180 лей).",
      },
      pressFeePerZoneMdl: { label: "Доплата за прессовку зоны" },
      minimumLineTotalMdl: { label: "Минимальная сумма строки" },
    },
    uv: {
      cmykMlPerSqm: {
        label: "Цветные чернила CMYK",
        hint: "Расход на 1 м² принта при сплошной заливке.",
      },
      whiteMlPerSqmPerLayer: {
        label: "Белила, за слой",
        hint: "Подложка на тёмных и прозрачных изделиях; умножается на число слоёв.",
      },
      varnishMlPerSqmPerLayer: {
        label: "Лак, за слой",
        hint: "Глянец или рельеф поверх цвета; умножается на число слоёв.",
      },
      wastePct: {
        label: "Потери на прочистку",
        hint: "Прочистки и промывки голов — добавляются к расходу чернил.",
      },
      whiteLayerSurchargePct: {
        label: "Доплата за белила",
        hint: "К цене формата зоны, если печатаются белила. 0 — входит в цену.",
      },
      varnishSurchargePct: {
        label: "Доплата за лак",
        hint: "К цене формата зоны, если печатается лак. 0 — входит в цену.",
      },
      includedPrintCreditMdl: {
        label: "Печать, включённая в цену изделия",
        hint: "Часть цены первой зоны, уже входящая в цену изделия со склада — как у маек в DTF. Только для изделий со склада; 0 — печать считается полностью.",
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
  },
};
