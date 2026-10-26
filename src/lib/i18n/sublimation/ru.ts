import type { SublimationDictionary } from "./types";

export const sublimationRu: SublimationDictionary = {
  productType: "Сублимация",
  productTypeHint: "Подушки, пазлы, брелоки, часы, коврики и кружки — со склада",
  errors: {
    subl_item_not_found: "Изделие не найдено, отключено или не отмечено «Сублимация»",
    subl_item_no_price: "У изделия нет цены за 1 шт.",
    subl_details_required: "Выберите изделие и количество для сублимации",
    subl_admin_only: "Сублимация оформляется только в админке",
  },
  editor: {
    item: "Изделие со склада",
    noItems: "Нет изделий для сублимации — отметьте категории склада «Сублимация»",
    quantity: "Шт.",
    inStock: (count) => `на складе ${count}`,
    shortage: (count) => `не хватает ${count}`,
    tier: (minQty) => (minQty > 1 ? `цена от ${minQty} шт.` : "цена за 1 шт."),
    dealerPrice: "дилерская цена",
    unitPrice: "За шт.",
    total: "Итого",
    cost: "Себестоимость",
    profit: "Прибыль",
    usage: (paper, tape, ink) => `бумага ${paper} л. · скотч ${tape} м · чернила ${ink} мл`,
    noNorms: "Нормы расхода для этой категории не заданы — Epson ничего не спишет.",
    normsLink: "Нормы расхода",
    pieces: (count) => `${count} шт.`,
  },
  workshop: {
    section: "Сублимация",
    noFiles: "нет файла принта",
  },
};
