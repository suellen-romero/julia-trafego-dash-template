# Conectar a ferramenta de vendas — exemplos

> A Mavi-da-Júlia escolhe **um** dos caminhos abaixo dependendo de onde a Júlia vende.
> Todos populam `meta.sales` no Supabase. A view `meta.sales_daily` agrega e o dashboard `/vendas` consome.

---

## 1) Stripe (assinaturas / pagamentos diretos)

**Setup:** Webhook do Stripe → Edge Function do Supabase → INSERT em `meta.sales`.

```bash
# Stripe Dashboard → Developers → Webhooks → Add endpoint
# URL: https://<projeto>.supabase.co/functions/v1/stripe-webhook
# Eventos: charge.succeeded, charge.refunded, invoice.paid
```

Edge Function `stripe-webhook` (esqueleto):

```ts
import Stripe from "https://esm.sh/stripe@14";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  const event = stripe.webhooks.constructEvent(body, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);

  if (event.type === "charge.succeeded") {
    const c = event.data.object as Stripe.Charge;
    await insertSale({
      external_id: c.id,
      source: "stripe",
      occurred_at: new Date(c.created * 1000).toISOString(),
      revenue: c.amount / 100,
      fee: (c.balance_transaction as any)?.fee ? (c.balance_transaction as any).fee / 100 : 0,
      customer_id: c.customer as string,
      product_name: c.description,
      status: "paid",
      raw: c,
    });
  }
  return new Response("ok");
});
```

## 2) Hotmart

**Setup:** Hotmart → Developers → Webhooks → Add. Selecionar evento `PURCHASE_COMPLETE`.

```ts
Deno.serve(async (req) => {
  const body = await req.json();
  if (body.event === "PURCHASE_COMPLETE") {
    await insertSale({
      external_id: body.data.purchase.transaction,
      source: "hotmart",
      occurred_at: body.data.purchase.order_date,
      revenue: body.data.purchase.price.value,
      product_name: body.data.product.name,
      customer_id: body.data.buyer.email,
      utm_source: body.data.purchase.tracking?.source,
      utm_campaign: body.data.purchase.tracking?.campaign,
      raw: body,
    });
  }
  return new Response("ok");
});
```

## 3) Kiwify

Mesmo padrão. Webhook Kiwify Settings → Webhooks → POST com `order.paid`.

## 4) Eduzz

`https://api.eduzz.com/sale` polling diário se webhook indisponível na conta dela.

## 5) Cakto

`POST` webhook em compra aprovada → mesmo handler.

## 6) Sem plataforma (vendas via WhatsApp / planilha)

Cria endpoint admin simples no dashboard pra Júlia adicionar venda manual, ou cron diário que lê planilha Google Sheets dela via Sheets API.

## 7) Plataforma própria

API custom. A Mavi adapta o handler.

---

## Cruzar venda com campanha Meta (pra ROAS por campanha)

Adicionar UTMs nas URLs dos anúncios:

```
?utm_source=meta&utm_campaign={{campaign.id}}&utm_content={{ad.id}}
```

A `utm_campaign` chega na venda (Hotmart/Kiwify capturam) → ao inserir em `meta.sales`, popular `campaign_id` quando bate. Aí o ROAS por campanha fica natural via JOIN com `meta.campaign_snapshot`.
