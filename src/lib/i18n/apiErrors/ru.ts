import type { ApiErrorsDictionary } from "./types";

export const apiErrorsRu: ApiErrorsDictionary = {
  sessionExpired: "Сессия истекла — войдите снова",
  signIn: "Войти",
  forbidden: "У вас нет прав на это действие",
  superadminOnly: "Это может сделать только главный администратор",
  notFound: "Не найдено — возможно, запись уже удалена",
  rejected: "Не получилось — проверьте данные и попробуйте ещё раз",
  tooLarge: "Файл слишком большой",
  tooManyRequests: "Слишком много запросов — подождите немного и попробуйте снова",
  serverError: "Ошибка на сервере",
  notSaved: "Данные не сохранены — попробуйте ещё раз",
  offline: "Нет соединения — проверьте интернет и попробуйте снова",
  generic: "Что-то пошло не так — попробуйте ещё раз",
};
