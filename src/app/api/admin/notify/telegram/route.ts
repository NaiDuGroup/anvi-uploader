import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { formatTelegramTest, sendTelegram, telegramStatus } from "@/lib/notify/telegram";

const NO_STORE = { "Cache-Control": "no-store" };

/** Settings «Уведомления»: is Telegram configured (never returns the token). Staff only. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(telegramStatus(), { headers: NO_STORE });
}

/** «Отправить тест»: one test message to the staff chat. Staff only. */
export async function POST() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await sendTelegram(formatTelegramTest(user.displayName || user.name));
  return NextResponse.json(result, { status: result.status === "failed" ? 502 : 200, headers: NO_STORE });
}
