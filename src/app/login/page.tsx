"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/api/auth/callback` : undefined },
    });
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <div className="max-w-sm mx-auto mt-20 card">
      <h1 className="text-xl font-semibold mb-1">Entrar</h1>
      <p className="text-sm text-muted mb-5">
        Vamos enviar um link mágico pro seu e-mail. Clica e tá dentro.
      </p>
      {sent ? (
        <p className="text-sm text-accent">Link enviado pra {email}. Olha sua caixa de entrada.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-md focus:outline-none focus:border-accent"
          />
          <button type="submit" className="w-full bg-accent text-white px-3 py-2 rounded-md hover:opacity-90">
            Receber link
          </button>
          {err && <p className="text-sm text-danger">{err}</p>}
        </form>
      )}
    </div>
  );
}
