# O que o mandato pagou

Painel interativo do patrimônio declarado por quem foi eleito deputado federal,
medido contra o subsídio que o cargo depositou no mesmo período.

**No ar em [rodado.xyz/analises/patrimonio](https://rodado.xyz/analises/patrimonio/)**

![O painel, na aba Panorama](screenshot.png)

## A pergunta

Todo candidato entrega à Justiça Eleitoral a lista de bens que declara possuir.
Quem se elege deputado federal recebe um subsídio de valor público, fixado por
decreto legislativo. Juntando as duas coisas dá para perguntar uma coisa
simples: **entre uma declaração e a seguinte, o patrimônio cresceu mais ou menos
do que o cargo pagou?**

A resposta é o *múltiplo do subsídio*, o eixo vertical do painel. Em 1× o
patrimônio cresceu exatamente o que o mandato depositou. Acima de 1× cresceu
mais. Isso não é acusação de nada: sobra salário de antes, herança, venda de
bem, ganho de capital, renda do cônjuge, empresa que deu lucro. O painel serve
para encontrar o caso que merece pergunta, não para respondê-la.

## O que tem aqui

1.025 pessoas, 4.050 declarações, de 2010 a 2026. O universo é quem foi eleito
deputado federal em alguma eleição de 2006 a 2022 — e a série traz **todas** as
candidaturas que essas pessoas registraram no período, inclusive a prefeito e a
vereador, porque toda candidatura carrega declaração de bens.

- **Panorama** — patrimônio contra múltiplo do subsídio, uma bolha por pessoa,
  cor por espectro partidário e tamanho por número de empresas. Rola para
  ampliar, arrasta para mover.
- **Dossiê** — a ficha de uma pessoa: a série no tempo, a composição de cada
  declaração nas sete categorias de bem, as empresas em que consta no quadro
  societário e a tabela eleição a eleição. Cada pessoa tem endereço próprio e
  compartilhável (`#d=nome-da-pessoa`).
- **Recortes** — sócio de empresa e crescimento acima do subsídio, cada um com
  três posições (sim / ambos / não). O estado inteiro do painel vive na URL,
  então qualquer vista dá link.

## Por que a série começa em 2010

Em 2006 e 2008 o `sequencial_candidato` **não é único** na tabela de candidatos
do TSE: 19.204 linhas para 3.162 sequenciais distintos em 2006, 381.250 para
68.551 em 2008. Como é essa a chave que liga candidato a bem declarado, juntar
por ela nesses dois anos espalha os bens de uma pessoa por dezenas de outras. O
sintoma foi um patrimônio de R$ 132.386.000 aparecendo idêntico em duas pessoas
diferentes. De 2010 em diante a chave é única e o cruzamento fecha.

## Ressalvas que o painel não esconde

**Os valores são nominais**, a custo de aquisição, como manda a regra do imposto
de renda. Não são corrigidos por inflação — e corrigir seria errado: imóvel
comprado em 1990 está declarado a preço de 1990.

**A régua é o subsídio bruto**, antes de imposto e previdência, e só conta os
meses de mandato *federal*. Período em mandato municipal ou estadual não soma
nada, porque o valor desses cargos não é conhecido aqui — o ponto sai marcado
como régua parcial em vez de fingir que o período foi de graça.

**As empresas são indício, não fato.** Vêm do quadro societário da Receita
Federal, casadas por nome e seis dígitos do CPF: há risco de homônimo. O CNPJ
fica de fora de propósito, para não dar à ligação uma precisão que ela não tem.
O capital social é o declarado no contrato social — não é faturamento nem a
participação da pessoa nele.

**2026 está incompleto.** O prazo de registro se encerra em 15/08/2026 e o
arquivo do TSE ainda cresce a cada dia. Ausência de alguém em 2026 não é
ausência de bem: é candidatura ainda não registrada. Esses pontos saem marcados
como provisórios.

**Ausência não é zero.** Pessoa sem declaração num ano pode simplesmente não ter
concorrido àquela eleição.

## De onde vem o dado

| fonte | o quê |
|---|---|
| TSE, `bens_candidato` | as declarações de bens, 2010–2024 |
| TSE, `candidatos` e `resultados_candidato_municipio` | CPF, nome, UF, partido, cargo e quem se elegeu |
| TSE, dados abertos do ciclo de 2026 | as candidaturas de 2026, ainda em protocolo |
| Receita Federal, CNPJ | quadro societário e capital social |
| Decretos legislativos | a tabela de vigências do subsídio parlamentar |

O `dados.json` é gerado por
[`scripts/extrai_patrimonio_deputados.py`](https://github.com/rafapolo/rodado/blob/main/scripts/extrai_patrimonio_deputados.py),
no repositório [rodado](https://github.com/rafapolo/rodado), que consulta o
espelho local dessas bases em DuckDB. O ciclo de 2026 é atualizado por
[`scripts/scrap/tse_eleicoes_2026.py`](https://github.com/rafapolo/rodado/blob/main/scripts/scrap/tse_eleicoes_2026.py),
que baixa o arquivo do TSE e o conforma ao mesmo schema dos outros anos.

Para regenerar o `dados.json` daqui é preciso acesso a esse espelho. Sem ele, o
painel roda normalmente com o `dados.json` que já está no repositório.

## Rodando

Não tem framework, não tem dependência de runtime. É HTML, CSS e um arquivo de
JavaScript. Qualquer servidor estático serve a fonte direto, sem build — só não
abra por `file://`, porque o `fetch` do `dados.json` precisa de HTTP.

```bash
git clone https://github.com/rafapolo/tse-bens.git
cd tse-bens
python3 -m http.server 8000
# abra http://localhost:8000
```

| arquivo | o quê |
|---|---|
| `index.html` | a página, com todo o CSS embutido |
| `app.js` | o painel inteiro — filtros, gráficos em SVG, dossiê, estado na URL |
| `dados.json` | 373 KB, gerado; o build o parte em dois para servir |
| `screenshot.png` | a imagem deste README |

O `dados.json` é compacto de propósito: partido, cargo e UF são índices para
tabelas no cabeçalho, e cada declaração é um array posicional, não um objeto. O
formato está descrito em `meta.campos_pessoa` e `meta.campos_ponto`, dentro do
próprio arquivo — as ressalvas acima também vivem lá, em `meta.ressalvas`, e o
painel as lê de lá em vez de repeti-las no código.

A página não busca CSS de lugar nenhum: todo o estilo está no `<style>` do
`index.html`, e as famílias são pilhas de sistema. O `index.html` serve o painel
dentro do rodado e fora dele sem mudar de caminho — tudo que ele pede é
relativo.

## Build

O build minifica o `app.js`, parte o `dados.json` em dois e junta em `dist/` o
que vai ao ar. Não transforma o CSS nem o HTML.

```bash
npm install
npm run build   # dist/{index.html,app.js,dados.json,dossies.json,sw.js,.nojekyll}
npm run serve   # build + servidor estático em dist/, na porta 8000
```

[Rolldown](https://rolldown.rs) faz o bundle: 57 KB → 29 KB de `app.js`, 19 KB →
11 KB depois do gzip. `dist/` e `node_modules/` não entram no git.

### Por que o dados.json sai partido em dois

A composição de cada declaração (`comp`, sete categorias) e a lista de empresas
(`empresas_lista`) somam 58% do arquivo, e nenhuma das duas é lida fora do
Dossiê — que mostra uma pessoa por vez. O Panorama, que é o que todo mundo vê
primeiro, não toca em nenhuma delas. Mesmo assim todo visitante baixava as duas
antes de o primeiro gráfico aparecer.

O build tira as duas de `dados.json`, escreve em `dossies.json` e anota o nome
desse arquivo em `meta.dossies`:

| arquivo | bruto | gzip | quando |
|---|---|---|---|
| `dados.json` | 167 KB | 48 KB | primeiro paint |
| `dossies.json` | 244 KB | 78 KB | no primeiro Dossiê |
| *antes, arquivo único* | *382 KB* | *130 KB* | *primeiro paint* |

O primeiro paint cai de 130 KB para 48 KB de gzip, −63%. A soma dos dois dá
126 KB, um pouco menos que os 130 KB de antes, então nem quem abre um Dossiê
paga a mais.

O `app.js` puxa o `dossies.json` num `requestIdleCallback` depois do primeiro
desenho, então na prática o clique numa pessoa não espera rede nenhuma (74 ms
no teste local, sem pedido novo). O link direto para uma ficha (`#d=nome`) com a
rede lenta é o único caso que espera, e aí aparece um "Carregando a ficha…"; se
o pedido falha, aparece o mesmo "tentar de novo" do carregamento principal.

Nada disso é obrigatório: se `meta.dossies` não existir — que é o caso ao servir
a fonte direto, sem build — o detalhe já veio no primeiro `fetch` e o caminho de
carregamento tardio não roda.

### O service worker, e por que os dois arquivos levam uma versão

O GitHub Pages fixa `Cache-Control: max-age=600` em tudo e não dá como mudar:
de dez em dez minutos quem volta rebaixa os 126 KB inteiros. O `sw.js` — gerado
pelo build, porque o nome do cache carrega o hash do conteúdo — resolve isso
servindo tudo do cache enquanto o dist for o mesmo. Na segunda visita não há um
único pedido de rede, e o painel funciona offline, inclusive abrindo dossiês.

Isso cria um problema que vale explicar, porque é a razão de o `dados.json` e o
`dossies.json` levarem um campo de versão. O detalhe é indexado pela **posição**
da pessoa no array, que é estável entre os dois arquivos de um mesmo build mas
não entre extrações: entra e sai gente, e as posições andam. Com o service
worker trocando arquivos por baixo de uma aba aberta, um deploy que caia entre o
`dados.json` que já está na memória e o pedido do `dossies.json` casaria os dois
pela posição errada — e penduraria **as empresas de uma pessoa na ficha de
outra**. Num painel de transparência esse é o erro que não pode acontecer.

Então o build escreve o mesmo hash em `meta.versao` e no `v` do detalhe, e o
`app.js` confere antes de casar os dois. Quando não casam, recarrega uma vez
para pegar o par inteiro — e uma marca em `sessionStorage` garante que uma
inconsistência de verdade pare no aviso de erro em vez de virar laço de
recarga. Conferido nos dois casos: deploy no meio da sessão recupera com uma
recarga só, e par permanentemente quebrado estabiliza e cai no "tentar de novo",
sem nunca mostrar dado trocado.

O service worker só entra no `dist/`, e o registro é injetado no `index.html` só
ali: o rodado serve por conta própria e pode mandar os cabeçalhos que quiser, e
a fonte deste repositório segue sem service worker nenhum.

## Publicação

Dois endereços, do mesmo push no `main`, por dois workflows independentes:

| workflow | onde |
|---|---|
| `publica-roda.yml` | manda `repository_dispatch` para o rodado, que remonta `rodado.xyz/analises/patrimonio/` |
| `publica-pages.yml` | roda o build e publica o `dist/` no GitHub Pages |

Para o Pages funcionar, é preciso apontar **Settings › Pages › Source** para
*GitHub Actions* uma vez. O `<link rel="canonical">` continua apontando para
`rodado.xyz/analises/patrimonio/`, que segue sendo o endereço de referência — a
cópia no Pages é espelho, e não disputa a mesma página na busca.

### O que saiu do `<head>` e por quê

A página carregava quatro folhas de estilo de terceiros — Google Fonts, Font
Awesome, `site.css` e `mcp-theme.css` do rodado. Nenhuma pintava nada aqui: não
há classe `fa-*` no HTML nem no JS, e o `:root` local redefine `--sans`,
`--serif` e `--mono` para pilhas de sistema, então as duas famílias baixadas
nunca chegavam a ser usadas (o navegador nem pedia os arquivos de fonte, só o
CSS). Eram quatro conexões novas, ~115 KB, todas bloqueando o primeiro paint.

Duas regras dessas folhas *eram* herdadas, sem querer, e viraram CSS local:

- `h1{line-height:1.08}`, do `mcp-theme.css` — sem ela o cabeçalho crescia 4px;
  virou `line-height` explícito no `header h1`.
- `h2{padding-top:.4rem;border-top:1px}`, do `site.css` — estilo de reportagem
  que vazava para o nome da pessoa no Dossiê, com um filete de 1px acima. Não
  foi reposto: era vazamento, não desenho. Se fizer falta, é uma linha em
  `.ficha h2`.

O `dados.json` é o caminho crítico e não depende de nada do `app.js`, então o
pedido sai de um `<script>` de uma linha no `<head>`, em paralelo com o download
do próprio `app.js`, que só o consome. É `fetch` e não `<link rel=preload
as=fetch>` porque o preload precisa casar modo e credenciais com o pedido real;
quando não casa, o navegador baixa os 373 KB duas vezes, calado.

## Licença

Os dados são públicos, do TSE e da Receita Federal. O código é livre para usar,
copiar e modificar. Se este painel for útil em alguma reportagem ou pesquisa, um
crédito a [rodado](https://rodado.xyz) é bem-vindo.
