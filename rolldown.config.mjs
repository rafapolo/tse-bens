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

/**
 * Separa o dados.json em dois: o que o panorama precisa e o que só o dossiê
 * usa. `comp` e `empresas_lista` são 58% do arquivo e nenhum dos dois é lido
 * fora do dossiê, que abre uma pessoa por vez — 130 KB de gzip no primeiro
 * paint viram 48 KB, e a soma dos dois arquivos ainda dá menos que o original.
 * O detalhe é indexado pela posição da pessoa no array, que é a mesma nos dois
 * arquivos porque saem os dois desta função.
 */
function separa(dados) {
  const d = JSON.parse(dados);
  const detalhe = {};

  d.pessoas.forEach((p, i) => {
    detalhe[i] = { e: p[LEMP], c: p[PTS].map((pt) => pt[COMP]) };
    p[LEMP] = [];
    for (const pt of p[PTS]) pt[COMP] = 0;
  });
  d.meta.dossies = DETALHE;

  const json = (o) => JSON.stringify(o);
  return { leve: json(d), pesado: json(detalhe) };
}

/** Copia o que não passa pelo grafo de módulos e parte o dados.json em dois. */
const estaticos = () => ({
  name: "estaticos",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "index.html",
      source: readFileSync("index.html"),
    });

    const { leve, pesado } = separa(readFileSync("dados.json", "utf8"));
    this.emitFile({ type: "asset", fileName: "dados.json", source: leve });
    this.emitFile({ type: "asset", fileName: DETALHE, source: pesado });

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
