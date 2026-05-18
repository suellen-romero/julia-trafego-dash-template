import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Middleware: confere sessão Supabase Auth. Se não logada → /login.
// Se logada mas e-mail != ALLOWED_EMAIL → /login?err=not_allowed.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/_next") ||
      pathname.startsWith("/manifest") || pathname.startsWith("/sw.js") ||
      pathname.startsWith("/icon-") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => res.cookies.set({ name, value, ...options }),
        remove: (name, options) => res.cookies.set({ name, value: "", ...options }),
      },
    }
  );
  const { data: { session } } = await supabase.auth.getSession();
  const allowed = (process.env.ALLOWED_EMAIL || "").toLowerCase();
  const userEmail = session?.user?.email?.toLowerCase();
  if (!session || !userEmail || userEmail !== allowed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (session && userEmail && userEmail !== allowed) url.searchParams.set("err", "not_allowed");
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
