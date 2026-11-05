/** «1 файл / 2 файла / 5 файлов / 21 файл». */
export function ruFilesCount(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} файл`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} файла`;
  return `${n} файлов`;
}

/** «1 fișier / 2 fișiere / 20 de fișiere». */
export function roFilesCount(n: number): string {
  if (n === 1) return "1 fișier";
  const m100 = n % 100;
  return n === 0 || (m100 >= 1 && m100 <= 19) ? `${n} fișiere` : `${n} de fișiere`;
}

/** «1 file / 2 files». */
export function enFilesCount(n: number): string {
  return `${n} ${n === 1 ? "file" : "files"}`;
}
