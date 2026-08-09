import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig } from "rolldown";

// O painel não tem dependência nenhuma: o build existe só para minificar o
// app.js e juntar em dist/ o que o GitHub Pages precisa servir. Tudo que sai
// daqui é estático e por caminho relativo, então o mesmo dist/ serve tanto em
// rafapolo.github.io/tse-bens/ quanto em rodado.xyz/analises/patrimonio/.

// Nome do arquivo de detalhe. Vai em meta.dossies para o app.js achá-lo; se um
// dia o build sair de cena, o campo não existe e o painel volta a ler tudo de
// um só arquivo, sem mudar uma linha de código.
const DETALHE = "dossies.json";

// Posições dentro de cada pessoa e de cada declaração — a mesma ordem que o
// dados.json documenta em meta.campos_pessoa e meta.campos_ponto.
const LEMP = 6; // empresas_lista, na pessoa
const PTS = 5; // pontos, na pessoa
const COMP = 6; // composição por categoria, na declaração
const BENS = 7; // bens item a item, na declaração

/**
 * Separa o dados.json em dois: o que o panorama precisa e o que só o dossiê
 * usa. `comp`, `empresas_lista` e `bens` são a quase totalidade do arquivo e
 * nenhum dos três é lido fora do dossiê, que abre uma pessoa por vez — 130 KB
 * de gzip no primeiro paint viram 48 KB.
 *
 * `bens` sozinho é 2,5 MB dos 2,8 MB do dados.json: são os 43.205 itens com a
 * descrição que cada pessoa escreveu. Fora daqui, o painel inteiro pesaria
 * vinte vezes mais para quem só quer ver o panorama.
 *
 * O detalhe é indexado pela posição da pessoa no array. A posição é estável
 * entre os dois arquivos porque saem os dois daqui, mas NÃO é estável entre
 * extrações: entra e sai gente, e as posições andam. Por isso os dois levam a
 * mesma `versao` — é ela que deixa o app.js perceber que está com um par
 * desencontrado nas mãos, em vez de mostrar as empresas de uma pessoa na ficha
 * de outra. Ver `carregaDetalhe` no app.js.
 */
function separa(dados, versao) {
  const d = JSON.parse(dados);
  const pessoas = {};

  d.pessoas.forEach((p, i) => {
    pessoas[i] = {
      e: p[LEMP],
      c: p[PTS].map((pt) => pt[COMP]),
      b: p[PTS].map((pt) => pt[BENS]),
    };
    p[LEMP] = [];
    for (const pt of p[PTS]) pt[COMP] = pt[BENS] = 0;
  });
  d.meta.dossies = DETALHE;
  d.meta.versao = versao;

  const json = (o) => JSON.stringify(o);
  return { leve: json(d), pesado: json({ v: versao, p: pessoas }) };
}

/**
 * Service worker, gerado aqui e não guardado como fonte porque o nome do cache
 * precisa carregar o hash do conteúdo deste build.
 *
 * O GitHub Pages fixa `Cache-Control: max-age=600` em tudo e não dá como mudar:
 * de dez em dez minutos quem volta rebaixa os 126 KB inteiros. Como o nome do
 * cache muda junto com o conteúdo, dá para servir tudo do cache sem tocar na
 * rede enquanto o dist for o mesmo — e, quando muda, o cache velho é jogado
 * fora inteiro. É isso que evita servir app.js novo com dados velhos: os quatro
 * arquivos entram e saem do cache como um conjunto.
 *
 * Só vale no Pages. O rodado serve por conta própria e pode mandar os
 * cabeçalhos que quiser, então lá nada disso é registrado.
 */
function serviceWorker(versao) {
  return `/* Gerado pelo build — ver rolldown.config.mjs. Não editar à mão. */
const CACHE = "tse-bens-${versao}";
const CASCA = ["./", "./index.html", "./app.js", "./dados.json"];
const ESCOPO = new URL("./", location).pathname;

self.addEventListener("install", ev => {
  /* O dossies.json fica de fora de propósito: quem o põe no cache é o pedido
     ocioso que o app.js já faz, e precachear aqui baixaria os mesmos 78 KB
     duas vezes na primeira visita. */
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCA)));
  /* Sem isto a versão nova instala e fica esperando todas as abas fecharem —
     e quem deixa a aba aberta pode passar dias na versão velha. O risco de
     trocar os arquivos debaixo de uma página que já está rodando é o par
     dados.json/dossies.json desencontrar; quem cuida disso é a checagem de
     meta.versao no app.js, que recarrega a página quando acontece. */
  self.skipWaiting();
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    for (const nome of await caches.keys()) {
      if (nome !== CACHE) await caches.delete(nome);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // deixa passar o que não é nosso (umami) e o que está fora do escopo
  if (url.origin !== location.origin) return;
  if (!url.pathname.startsWith(ESCOPO)) return;

  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(req, { ignoreSearch: true });
    if (guardado) return guardado;
    try {
      const resp = await fetch(req);
      if (resp.ok && resp.type === "basic") cache.put(req, resp.clone());
      return resp;
    } catch (err) {
      // offline e fora do cache: a casca ainda responde a uma navegação
      if (req.mode === "navigate") {
        const casca = await cache.match("./index.html");
        if (casca) return casca;
      }
      throw err;
    }
  })());
});
`;
}

/* updateViaCache:"none" faz o browser revalidar o próprio sw.js em vez de
   confiar nos 600 s que o Pages manda — senão um deploy novo podia passar dez
   minutos invisível. Registra no load para não disputar banda com o dados.json.
   Injetado só aqui, no dist: a fonte segue sem service worker nenhum. */
const REGISTRO = `<script>
if("serviceWorker" in navigator) addEventListener("load", function(){
  navigator.serviceWorker.register("./sw.js", {updateViaCache:"none"});
});
</script>
`;

/** Copia o que não passa pelo grafo de módulos e parte o dados.json em dois. */
const estaticos = () => ({
  name: "estaticos",
  generateBundle(_opcoes, bundle) {
    const dados = readFileSync("dados.json", "utf8");
    let html = readFileSync("index.html", "utf8");

    // Sai do conteúdo de entrada, e não do de saída, porque a versão entra nos
    // dois arquivos gerados — calcular sobre eles seria circular.
    const versao = createHash("sha256")
      .update(html)
      .update(bundle["app.js"].code)
      .update(dados)
      .digest("hex")
      .slice(0, 12);

    const { leve, pesado } = separa(dados, versao);

    if (!html.includes("</body>")) throw new Error("index.html sem </body>");
    html = html.replace("</body>", REGISTRO + "</body>");

    this.emitFile({ type: "asset", fileName: "index.html", source: html });
    this.emitFile({ type: "asset", fileName: "dados.json", source: leve });
    this.emitFile({ type: "asset", fileName: DETALHE, source: pesado });
    this.emitFile({ type: "asset", fileName: "sw.js", source: serviceWorker(versao) });

    // Sem isto o Pages roda o Jekyll no output e ignora arquivos com "_".
    this.emitFile({ type: "asset", fileName: ".nojekyll", source: "" });
  },
});

export default defineConfig({
  input: "app.js",
  plugins: [estaticos()],
  output: {
    dir: "dist",
    // app.js é um IIFE sem import/export; iife mantém isso e não exige
    // type="module" na tag <script defer> do index.html.
    format: "iife",
    entryFileNames: "app.js",
    minify: true,
  },
});
