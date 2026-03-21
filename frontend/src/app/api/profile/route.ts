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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(null, { status: 200 });

  const res = await fetch(`${BACKEND_URL}/api/profile`, {
    headers: backendHeaders(session.user.id),
    cache: "no-store",
  });
  if (res.status === 404) return NextResponse.json(null, { status: 200 });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const res = await fetch(`${BACKEND_URL}/api/profile/interview`, {
    method: "POST",
    headers: backendHeaders(session.user.id),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
