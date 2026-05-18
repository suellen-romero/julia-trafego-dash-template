import { NextResponse, type NextRequest } from "next/server";

// Auth simples: o usuário só passa se o cookie sb-auth tiver e-mail = ALLOWED_EMAIL.
// O fluxo de login (magic link) é tratado em /login.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/_next") ||
      pathname.startsWith("/api/auth") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  const allowed = process.env.ALLOWED_EMAIL || "";
  const c = req.cookies.get("julia-auth-email")?.value;
  if (!c || c.toLowerCase() !== allowed.toLowerCase()) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
