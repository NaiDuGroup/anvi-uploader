import type { TranslationDictionary } from "./types";

export const ru: TranslationDictionary = {
  common: {
    orderId: "ID заказа",
    status: "Статус",
    phone: "Телефон",
    files: "Файлы",
    file: "файл",
    created: "Создан",
    actions: "Действия",
    refresh: "Обновить",
    submit: "Отправить",
    submitting: "Отправка...",
    copied: "Скопировано!",
    loading: "Загрузка...",
    submitted: "Отправлен",
  },
  upload: {
    title: "Загрузка на печать",
    subtitle: "Загрузите файлы, а мы позаботимся об остальном",
    dragDrop: "Перетащите файлы сюда или",
    browseFiles: "выберите файлы",
    addMore: "Добавить ещё файлы",
    phoneLabel: "Номер телефона *",
    phonePlaceholder: "+373 XX XXX XXX",
    phoneError: "Номер телефона должен содержать минимум 8 символов",
    submitOrder: "Отправить заказ",
    colorOption: "Цвет",
    bwOption: "Ч/Б",
  },
  success: {
    title: "Заказ отправлен!",
    message: "Ваш заказ получен и обрабатывается.",
    copyLink: "Скопировать ссылку отслеживания",
    viewStatus: "Посмотреть статус заказа",
  },
  admin: {
    title: "Панель администратора",
    searchPlaceholder: "Поиск по номеру телефона...",
    noOrders: "Заказы не найдены",
    loadingOrders: "Загрузка заказов...",
    order: "Заказ",
    take: "Взять",
    workshop: "Мастерская",
    ready: "Готово",
    issue: "Проблема",
    filesCount: (count: number) => {
      if (count === 1) return "1 файл";
      if (count >= 2 && count <= 4) return `${count} файла`;
      return `${count} файлов`;
    },
  },
  statuses: {
    NEW: "Новый",
    IN_PROGRESS: "В работе",
    ASSIGNED: "Назначен",
    SENT_TO_WORKSHOP: "Отправлен в мастерскую",
    WORKSHOP_PRINTING: "Печатается",
    READY: "Готово",
    ISSUE: "Проблема",
  },
  clientStatuses: {
    inProgress: "В процессе",
    ready: "Готово",
  },
  track: {
    title: "Статус заказа",
    errorTitle: "Не удаётся отследить заказ",
  },
};
