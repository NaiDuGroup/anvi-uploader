import { NextResponse } from "next/server";
import { loadUvCatalog } from "@/lib/uv/uvCatalog";
import { requireUvUser, UvAccess, uvRouteError } from "@/lib/uv/uvRoute";

export async function GET() {
  const user = await requireUvUser(UvAccess.Read);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json(await loadUvCatalog());
  } catch (error) {
    return uvRouteError(error, "catalog");
  }
}
