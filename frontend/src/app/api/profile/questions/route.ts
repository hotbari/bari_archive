import { auth } from "@/auth";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${BACKEND_URL}/api/profile/questions`, {
    headers: {
      "x-api-key": BACKEND_API_KEY,
      "x-user-id": session.user.id,
    },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
