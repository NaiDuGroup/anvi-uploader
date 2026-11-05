import { prisma } from "@/lib/prisma";

const SESSION_NAME = "admin_session";

export function baseUrl(): string {
  const url = process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;
  if (!url) {
    throw new Error(
      "Set TEST_BASE_URL or PLAYWRIGHT_BASE_URL (e.g. http://127.0.0.1:3100)",
    );
  }
  return url.replace(/\/$/, "");
}

/** Extract admin_session cookie value for Cookie request header */
export function sessionCookieFromResponse(res: Response): string | null {
  const list =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  for (const c of list) {
    if (c.startsWith(`${SESSION_NAME}=`)) {
      return c.split(";")[0] ?? null;
    }
  }
  const raw = res.headers.get("set-cookie");
  if (raw) {
    const parts = raw.split(/,(?=[^;]+?=)/);
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed.startsWith(`${SESSION_NAME}=`)) {
        return trimmed.split(";")[0] ?? null;
      }
    }
  }
  return null;
}

export async function login(
  name: string,
  password: string,
): Promise<{ cookie: string }> {
  const res = await fetch(`${baseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed ${res.status}: ${body}`);
  }
  const cookie = sessionCookieFromResponse(res);
  if (!cookie) {
    throw new Error("No admin_session cookie in login response");
  }
  return { cookie };
}

export const TEST_ADMIN = {
  name: "e2e-admin@anvi.test",
  password: "testpass123",
};

export const TEST_WORKSHOP = {
  name: "e2e-workshop@anvi.test",
  password: "testpass123",
};

export const TEST_SUPERADMIN = {
  name: "e2e-superadmin@anvi.test",
  password: "testpass123",
};

/**
 * An order-scope object key in the exact shape `POST /api/upload-url` builds
 * (`uploads/<ms>-<nanoid(8)>-<name>`): guest `POST /api/orders` accepts no other key.
 */
export function testUploadKey(name: string): string {
  return `uploads/1700000000000-itTestK0-${name}`;
}

/**
 * A guest `POST /api/orders` answers with `{ id, orderNumber, publicToken }`
 * only; tests read the full row from the DB.
 */
export async function guestOrderRow(res: Response) {
  const { id } = (await res.json()) as { id: string };
  return prisma.order.findUniqueOrThrow({ where: { id } });
}
