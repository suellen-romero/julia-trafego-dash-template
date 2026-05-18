"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

function LoginForm() {
  const sp = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [err, setErr] = useState<string | null>(
    sp.get("err") === "not_allowed" ? "Este e-mail não está autorizado a entrar." : null
  );
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    const sb = supabaseBrowser();
    try {
      const { error } = mode === "signin"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password });
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Erro ao entrar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12 sm:mt-20 card">
      <h1 className="text-xl font-semibold mb-1">
        {mode === "signin" ? "Entrar" : "Criar senha"}
      </h1>
      <p className="text-sm text-muted mb-5">
        {mode === "signin"
          ? "Entra com seu e-mail e senha."
          : "Cria sua senha na primeira vez. Depois é só essa senha."}
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email" required placeholder="seu@email.com"
          autoComplete="email" inputMode="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-line rounded-md focus:outline-none focus:border-accent"
        />
        <input
          type="password" required minLength={6} placeholder="sua senha"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-line rounded-md focus:outline-none focus:border-accent"
        />
        <button type="submit" disabled={busy}
          className="w-full bg-accent text-white px-3 py-2 rounded-md hover:opacity-90 disabled:opacity-50">
          {busy ? "..." : mode === "signin" ? "Entrar" : "Criar conta"}
        </button>
        {err && <p className="text-sm text-danger">{err}</p>}
      </form>
      <button
        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); }}
        className="mt-3 text-sm text-muted hover:text-ink underline"
      >
        {mode === "signin" ? "Primeira vez aqui? Criar senha" : "Já tem senha? Entrar"}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
