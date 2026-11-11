// ============================================================
//  EDITA AQUI: produtos e preços (em cêntimos: 1500 = 15,00 €)
// ============================================================
const TITULO = "Natal no Novo Futuro";
const NOTA = ""; // Texto opcional mostrado no fim (ex.: informação sobre levantamento/entrega)

const MENU = [
  { id: "castanhas",   nome: "Castanhas Caramelizadas", desc: "500 g",       preco: 1500 },
  { id: "geleia",      nome: "Geleia de Piri-Piri",     desc: "",            preco: 800  },
  { id: "piripiri",    nome: "Piri-Piri",               desc: "",            preco: 1000 },
  { id: "crepes",      nome: "Crepes de Camarão",       desc: "12 unidades", preco: 4500 },
  { id: "escabeche",   nome: "Perdizes de Escabeche",   desc: "2 unidades",  preco: 4000 },
  { id: "estufadas",   nome: "Perdizes Estufadas",      desc: "6 unidades",  preco: 9000 },
];
const MAX_POR_PRODUTO = 20;
// ============================================================

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

class ErroPedido extends Error {}

function lerPedido(corpo) {
  const itens = [];
  let total = 0;
  for (const p of MENU) {
    const q = Number(corpo?.itens?.[p.id] ?? 0);
    if (!Number.isInteger(q) || q < 0 || q > MAX_POR_PRODUTO) {
      throw new ErroPedido("Quantidade inválida.");
    }
    if (q > 0) {
      itens.push({ ...p, q });
      total += p.preco * q; // o preço vem sempre do servidor
    }
  }
  if (!itens.length) throw new ErroPedido("Escolhe pelo menos um produto.");

  const nome = String(corpo?.nome ?? "").trim().slice(0, 100);
  const telemovel = String(corpo?.telemovel ?? "").trim().slice(0, 30);
  const email = String(corpo?.email ?? "").trim().slice(0, 150);
  const notas = String(corpo?.notas ?? "").trim().slice(0, 300);
  const entrega = corpo?.receber === "entrega";
  const morada = String(corpo?.morada ?? "").trim().slice(0, 150);
  const cp = String(corpo?.cp ?? "").trim().slice(0, 10);
  const localidade = String(corpo?.localidade ?? "").trim().slice(0, 80);
  if (nome.length < 2) throw new ErroPedido("Indica o teu nome.");
  if (telemovel.replace(/\D/g, "").length < 9) throw new ErroPedido("Indica um telemóvel válido.");

  if (entrega) {
    if (morada.length < 5) throw new ErroPedido("Indica a morada de entrega.");
    if (!/^\d{4}-?\d{3}$/.test(cp)) throw new ErroPedido("Indica o código postal (0000-000).");
    if (localidade.length < 2) throw new ErroPedido("Indica a localidade.");
  }
  const receber = entrega ? `Entrega: ${morada}, ${cp} ${localidade}` : "Levantamento";

  const resumo = itens.map((i) => `${i.q}x ${i.nome}`).join(", ");
  return { itens, total, nome, telemovel, email, notas, receber, resumo };
}

async function stripe(caminho, params) {
  const corpo = new URLSearchParams();
  for (const [k, v] of params) corpo.append(k, v);
  const r = await fetch("https://api.stripe.com/v1/" + caminho, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: corpo,
  });
  const dados = await r.json();
  if (!r.ok) {
    console.error("Erro Stripe:", JSON.stringify(dados));
    throw new Error("Não foi possível iniciar o pagamento. Tenta outra vez.");
  }
  return dados;
}

function metadados(prefixo, p) {
  const m = [
    [`${prefixo}[nome]`, p.nome],
    [`${prefixo}[telemovel]`, p.telemovel],
    [`${prefixo}[pedido]`, p.resumo.slice(0, 500)],
    [`${prefixo}[receber]`, p.receber],
  ];
  if (p.notas) m.push([`${prefixo}[notas]`, p.notas]);
  return m;
}

async function criarPaymentIntent(p) {
  const params = [
    ["amount", String(p.total)],
    ["currency", "eur"],
    ["payment_method_types[]", "card"], // Apple Pay e Google Pay passam por aqui
    ["description", `${TITULO}: ${p.nome} (${p.resumo})`.slice(0, 500)],
    ...metadados("metadata", p),
  ];
  if (p.email) params.push(["receipt_email", p.email]);
  const pi = await stripe("payment_intents", params);
  return { clientSecret: pi.client_secret };
}

async function criarCheckoutMbway(p, origem) {
  const params = [
    ["mode", "payment"],
    ["payment_method_types[]", "mb_way"],
    ["locale", "pt"],
    ["success_url", origem + "/?pago=1"],
    ["cancel_url", origem + "/"],
    ["payment_intent_data[description]", `${TITULO}: ${p.nome} (${p.resumo})`.slice(0, 500)],
    ...metadados("payment_intent_data[metadata]", p),
    ...metadados("metadata", p),
  ];
  if (p.email) params.push(["customer_email", p.email]);
  p.itens.forEach((i, n) => {
    params.push([`line_items[${n}][quantity]`, String(i.q)]);
    params.push([`line_items[${n}][price_data][currency]`, "eur"]);
    params.push([`line_items[${n}][price_data][unit_amount]`, String(i.preco)]);
    params.push([`line_items[${n}][price_data][product_data][name]`, i.nome]);
  });
  const sessao = await stripe("checkout/sessions", params);
  return { url: sessao.url };
}

exports.handler = async (event) => {
  const rota = (event.path || "").split("/").filter(Boolean).pop();
  try {
    if (event.httpMethod === "GET" && rota === "menu") {
      return json(200, {
        titulo: TITULO,
        nota: NOTA,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        itens: MENU,
        max: MAX_POR_PRODUTO,
      });
    }
    if (event.httpMethod === "POST" && (rota === "pay-intent" || rota === "mbway")) {
      const pedido = lerPedido(JSON.parse(event.body || "{}"));
      if (rota === "pay-intent") return json(200, await criarPaymentIntent(pedido));
      const origem = event.headers.origin || process.env.URL;
      return json(200, await criarCheckoutMbway(pedido, origem));
    }
    return json(404, { erro: "Não encontrado." });
  } catch (e) {
    const status = e instanceof ErroPedido ? 400 : 500;
    return json(status, { erro: e.message });
  }
};
