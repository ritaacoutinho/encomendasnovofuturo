# Encomendas de Natal – Novo Futuro

Página de encomenda com total automático e pagamento por Apple Pay, Google Pay ou MB WAY (via Stripe).
Custo: só as taxas do Stripe (1,5% + 0,25 € por pagamento). Netlify e GitHub no plano gratuito.

## Como pôr no ar

1. **Stripe** (stripe.com): cria e ativa a conta. Em *Definições > Métodos de pagamento* ativa
   Cartões, Apple Pay, Google Pay e MB WAY. Em *Programadores > Chaves da API* copia a chave
   publicável (pk_...) e a chave secreta (sk_...). Começa com as chaves de teste.
2. **GitHub** (github.com): cria um repositório e carrega para lá, com "Add file > Upload files",
   todos os ficheiros desta pasta (mantendo a pasta netlify/functions).
3. **Netlify** (netlify.com): *Add new site > Import an existing project* e escolhe o repositório.
   Em *Site configuration > Environment variables* cria:
   - STRIPE_SECRET_KEY  = sk_...
   - STRIPE_PUBLISHABLE_KEY = pk_...
   Faz *Deploy*.
4. **Apple Pay**: no Stripe, *Definições > Métodos de pagamento > Apple Pay > Adicionar novo domínio*
   e indica o endereço do site (por exemplo o-teu-site.netlify.app).
5. **Testar** com as chaves de teste. Quando estiver tudo bem, troca as duas variáveis do Netlify
   pelas chaves reais (live) e volta a fazer deploy.

## Alterar produtos e preços

No topo de `netlify/functions/api.js` (preços em cêntimos). O site e o pagamento usam sempre esta lista,
por isso ninguém consegue alterar o valor no browser.

## Ver as encomendas

No Stripe, em *Pagamentos*: cada pagamento mostra o nome, o telemóvel, o que foi pedido e as notas.
