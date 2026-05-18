# Julia Trafego Dash — Template

Template Next.js + Supabase + Tailwind pro dashboard de tráfego Meta Ads diário.

Pronto pra fork → editar 3 envs → deploy Vercel.

## Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Supabase JS (anon read via RLS)
- Recharts (gráficos)
- Auth simples por magic-link com whitelist de 1 e-mail (`ALLOWED_EMAIL`)

## Pré-requisitos

1. Projeto Supabase rodando com schema `meta` aplicado (veja `schema/001_meta_dashboard_julia.sql` no pacote pai)
2. ETL `etl_meta.py` populando os snapshots
3. E-mail da pessoa que vai acessar

## Variáveis (`.env.local` / Vercel env)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ALLOWED_EMAIL=julia@dominio.dela
```

## Rodar local

```bash
npm install
cp .env.example .env.local
# edita .env.local
npm run dev
# abre http://localhost:3000
```

## Deploy Vercel

```bash
# 1. push pra um repo no GitHub
git remote add origin https://github.com/<seu_usuario>/julia-trafego-dash.git
git push -u origin main

# 2. vai em vercel.com/new → import repo → set envs → Deploy
```

## Páginas

- `/` — home (cards + alerta budget)
- `/campanhas` — tabela ordenada por gasto
- `/historico` — gráficos 7/30/90 dias
- `/login` — magic link Supabase

## Tema

Editar `tailwind.config.ts`. Defaults sóbrios: verde executivo `#2A4D3F`, âmbar `#C89A3A`, vermelho contido `#B23A48`, fundo `#FAFAF7`.

## Licença

MIT. Use à vontade.
