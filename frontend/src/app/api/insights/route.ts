import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

function backendHeaders(userId: string) {
  return {
    "Content-Type": "application/json",
    "x-api-key": BACKEND_API_KEY,
    "x-user-id": userId,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const url = new URL(`${BACKEND_URL}/api/insights/`);
  searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: backendHeaders(session.user.id),
    cache: "no-store",
  });

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
