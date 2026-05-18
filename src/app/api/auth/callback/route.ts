import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Endpoint que Supabase magic-link chama após cliente confirmar.
// Lê e-mail do hash fragment via cliente; alternativamente o Next pode usar @supabase/ssr.
// Para simplicidade, esse callback apenas seta o cookie se o ALLOWED_EMAIL bater.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const email = url.searchParams.get("email")?.toLowerCase();
  const allowed = (process.env.ALLOWED_EMAIL || "").toLowerCase();
  const res = NextResponse.redirect(new URL("/", url));
  if (email && email === allowed) {
    res.cookies.set("julia-auth-email", email, {
      httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, // 30d
    });
  } else {
    return NextResponse.redirect(new URL("/login?err=not_allowed", url));
  }
  return res;
}
