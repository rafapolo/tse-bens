(function(){
"use strict";
/* O index.html dispara o fetch no <head> e deixa a promessa em window.__dados;
   o fallback mantém o app.js funcionando sozinho, sem aquela linha. */
(window.__dados || fetch("dados.json")).then(r=>{
  if(!r.ok) throw new Error("HTTP "+r.status);
  return r.json();
}).then(function(D){
const M = D.meta, PESSOAS = D.pessoas;
const [NOME,UF,ESP,EMP,CAP,PTS,LEMP] = [0,1,2,3,4,5,6];
const [ANO,PART,CARGO,TOTAL,REGUA,FLAGS,COMP] = [0,1,2,3,4,5,6];
const F_ELEITO=1, F_REGUA_PARCIAL=2, F_ANO_PARCIAL=4;
const CAT_ROTULO = {imovel:"imóveis",veiculo:"veículos",dinheiro:"dinheiro",
  aplicacao:"aplicações",societaria:"participações societárias",
  credito:"créditos",outros:"outros"};
const CAT_COR = ["#7d6b58","#8a8f7e","#5d7f88","#6f8fa8","#c2683c","#9a7f9c","#a9b2ac"];

/* ── derivados por pessoa, calculados uma vez ───────────────────────────── */
// Índice por apelido de URL. O identificador não pode ser a posição no array:
// a cada extração nova entram e saem pessoas, as posições andam, e um link
// compartilhado passaria a abrir outra pessoa. O nome normalizado é estável
// entre extrações e ainda diz de quem se trata quando o link é colado.
const PORSLUG = Object.create(null);

PESSOAS.forEach((p,i)=>{
  const pts = p[PTS];
  p.i = i;
  p.chave = p[NOME].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  p.base = p.chave.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")
           || ("pessoa-"+i);
  p.ultimo = pts[pts.length-1];
  p.primeiro = pts[0];
  p.patrimonio = p.ultimo[TOTAL];
  p.partidoAtual = p.ultimo[PART] >= 0 ? M.partidos[p.ultimo[PART]] : null;
  p.crescimento = p.ultimo[TOTAL] - p.primeiro[TOTAL];
  p.regua = pts.reduce((s,x)=> s + (x[REGUA]||0), 0);
  // Piso da régua: cerca de doze meses de subsídio. Sem ele, quem passou só
  // uns poucos meses em mandato federal dentro da janela entre duas
  // declarações ganha uma régua de valor ínfimo, e a divisão devolve
  // múltiplos absurdos — 92.495× no caso que apareceu no teste. Régua curta
  // não mede: essas pessoas entram como "sem régua comparável", que é o que
  // de fato são.
  p.multiplo = p.regua >= 200000 ? p.crescimento / p.regua : null;
  p.mandatos = pts.filter(x=> x[FLAGS] & F_ELEITO).length;
  p.parcial = pts.some(x=> x[FLAGS] & F_ANO_PARCIAL);
});

/* Hoje nenhum dos 1.025 nomes se repete, mas o apelido não pode depender
   disso. Se um xará entrar numa extração futura, resolver a disputa por ordem
   de aparição seria pior do que não resolver: as duas pessoas trocariam de
   apelido conforme o array mudasse, e um link já compartilhado passaria a
   abrir a outra — em silêncio. Então, quando há xará, ninguém fica com o nome
   puro: os dois recebem UF e, se ainda empatarem, o ano da primeira
   declaração. Tudo é dado da própria pessoa, então o apelido de cada uma não
   depende de quem mais existe no arquivo. */
{
  const porBase = Object.create(null);
  PESSOAS.forEach(p=> (porBase[p.base] = porBase[p.base] || []).push(p));
  for(const base in porBase){
    const grupo = porBase[base];
    if(grupo.length === 1){ grupo[0].slug = base; continue; }
    grupo.forEach(p=>{
      const uf = p[UF] >= 0 ? M.ufs[p[UF]].toLowerCase() : "br";
      p.slug = base + "-" + uf;
    });
    const porUf = Object.create(null);
    grupo.forEach(p=> (porUf[p.slug] = porUf[p.slug] || []).push(p));
    for(const s in porUf){
      if(porUf[s].length === 1) continue;
      porUf[s].forEach(p=>{ p.slug = s + "-" + p.primeiro[ANO]; });
    }
  }
  // último desempate, para o caso de dois xarás da mesma UF estrearem no mesmo
  // ano: aí não há dado que os separe, e a posição é o que resta
  PESSOAS.forEach(p=>{
    if(!PORSLUG[p.slug]){ PORSLUG[p.slug] = p; return; }
    let n = 2; while(PORSLUG[p.slug+"-"+n]) n++;
    p.slug += "-"+n; PORSLUG[p.slug] = p;
  });
}

/* ── formatação ─────────────────────────────────────────────────────────── */
const nf = new Intl.NumberFormat("pt-BR");
function brl(v){
  const a = Math.abs(v), s = v<0 ? "−" : "";
  if(a >= 1e6) return s+"R$ "+(a/1e6).toFixed(a>=1e7?0:1).replace(".",",")+" mi";
  if(a >= 1e3) return s+"R$ "+Math.round(a/1e3)+" mil";
  return s+"R$ "+nf.format(Math.round(a));
}
function mult(v){
  if(v === null) return "—";
  return (v<0?"−":"")+Math.abs(v).toFixed(Math.abs(v)<10?1:0).replace(".",",")+"×";
}
function corMult(v){
  if(v === null) return "var(--ink3)";
  return v > 1 ? "var(--acima)" : "var(--abaixo)";
}

/* ── estado ─────────────────────────────────────────────────────────────── */
/* Os dois recortes têm três posições: "" (ambos), "sim" e "nao". O teste de
   cada um mora aqui junto do rótulo, para não ficar espalhado entre o filtro,
   o controle e o endereço. */
const RECORTES = [
  {id:"empresa", url:"emp", rotulo:"sócio de empresa",
   sim: p=> !!p[EMP]},
  // sem régua não é "cresceu abaixo": é não dá para dizer. Fica fora dos dois.
  {id:"acima", url:"ac", rotulo:"cresceu acima do subsídio",
   sim: p=> p.multiplo !== null && p.multiplo > 1,
   nao: p=> p.multiplo !== null && p.multiplo <= 1},
];

/* Coluna única — a mesma dobra em que o rail vira gaveta e a lista vira aba. */
const estreitaTela = ()=> innerWidth < 880;

/* Quanta ficha entra por vez. No celular cada ficha ainda traz uma miniatura
   em SVG, e 120 delas remontadas a cada tecla digitada travam o aparelho
   modesto: lá a página é menor, e o "mostrar mais" continua ali. */
const PAGINA = estreitaTela() ? 40 : 120;

const est = {q:"", espectro:new Set(), partido:"", uf:"",
             empresa:"", acima:"",
             aba:"panorama", sel:null, fixados:[],
             ordem:"multiplo", limite:PAGINA};

/* O estado inteiro do painel vive no endereço: quem está aberto, que filtros,
   que ordenação. Quem abre um dossiê pode copiar a barra de endereço e mandar
   para alguém, que abre exatamente na mesma tela. A pessoa entra como apelido
   (`d=fulano-de-tal`); `i=<posição>`, que era como se guardava antes, ainda é
   aceito para não quebrar link já compartilhado. */
function indiceDe(v){
  if(v === null || v === undefined || v === "") return null;
  if(PORSLUG[v]) return PORSLUG[v].i;
  const n = Number(v);                       // forma antiga: posição no array
  return Number.isInteger(n) && PESSOAS[n] ? n : null;
}
function apelidoDe(i){ return PESSOAS[i] ? PESSOAS[i].slug : null; }

let ultimaUrl = null;   // o endereço que o app escreveu por último

function leHash(){
  const h = new URLSearchParams(location.hash.slice(1));
  est.q = h.get("q") || "";
  est.espectro = new Set((h.get("e")||"").split(",").filter(Boolean));
  est.partido = h.get("p") || "";
  est.uf = h.get("uf") || "";
  // "1" era o valor da época da caixa de marcar, e queria dizer "sim"
  RECORTES.forEach(r=>{
    const v = h.get(r.url);
    est[r.id] = v === "1" || v === "sim" ? "sim" : v === "nao" ? "nao" : "";
  });
  est.ordem = ORDENS[h.get("ord")] ? h.get("ord") : "multiplo";
  est.limite = PAGINA;
  est.sel = indiceDe(h.get("d") !== null ? h.get("d") : h.get("i"));
  est.fixados = (h.get("fx")||"").split(",").map(indiceDe)
                .filter(i=> i !== null);
  // com pessoa no endereço a aba implícita é o dossiê: assim `#d=fulano`,
  // escrito à mão ou encurtado, abre a ficha dela em vez do panorama.
  // "lista" só existe em coluna única — na tela larga a lista está sempre ali
  // ao lado, e a aba não teria o que mostrar
  const abas = estreitaTela() ? ["panorama","dossie","lista"]
                              : ["panorama","dossie"];
  est.aba = abas.includes(h.get("aba")) ? h.get("aba")
            : est.sel !== null ? "dossie" : "panorama";
}
function gravaHash(empurra){
  const h = new URLSearchParams();
  if(est.q) h.set("q", est.q);
  if(est.espectro.size) h.set("e", [...est.espectro].join(","));
  if(est.partido) h.set("p", est.partido);
  if(est.uf) h.set("uf", est.uf);
  RECORTES.forEach(r=>{ if(est[r.id]) h.set(r.url, est[r.id]); });
  if(est.ordem !== "multiplo") h.set("ord", est.ordem);
  if(est.sel !== null) h.set("d", apelidoDe(est.sel));
  if(est.aba !== (est.sel !== null ? "dossie" : "panorama")) h.set("aba", est.aba);
  if(est.fixados.length) h.set("fx", est.fixados.map(apelidoDe).join(","));
  // o "+" que o URLSearchParams usa no lugar do espaço fica ilegível num
  // endereço colado no WhatsApp; %20 é o que os navegadores mostram de volta
  const url = "#" + h.toString().replace(/\+/g, "%20");
  // trocar de parlamentar é navegação — entra no histórico, e o "voltar"
  // devolve quem estava aberto antes. Mexer em filtro só reescreve.
  if(empurra && url !== ultimaUrl) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
  ultimaUrl = url;
}

/* ── filtro ─────────────────────────────────────────────────────────────── */
function filtra(){
  const q = est.q.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();
  return PESSOAS.filter(p=>{
    if(q && !p.chave.includes(q)) return false;
    if(est.espectro.size){
      const e = p[ESP] >= 0 ? M.espectros[p[ESP]] : "sem";
      if(!est.espectro.has(e)) return false;
    }
    if(est.partido && p.partidoAtual !== est.partido) return false;
    if(est.uf && (p[UF] < 0 || M.ufs[p[UF]] !== est.uf)) return false;
    for(const r of RECORTES){
      if(!est[r.id]) continue;
      const passa = est[r.id] === "sim" ? r.sim(p)
                  : r.nao ? r.nao(p) : !r.sim(p);
      if(!passa) return false;
    }
    return true;
  });
}

/* ── controles ──────────────────────────────────────────────────────────── */
const el = id => document.getElementById(id);
const ESPECTROS = [["esquerda","esq"],["centro","cen"],["direita","dir"],["sem","sem"]];

function montaControles(){
  el("fEspectro").innerHTML = ESPECTROS.map(([e,c])=>
    `<button class="chip ${c}" type="button" data-e="${e}" aria-pressed="false">${
      e === "sem" ? "sem classificação" : e}</button>`).join("");
  el("fEspectro").onclick = ev=>{
    const b = ev.target.closest("[data-e]"); if(!b) return;
    const e = b.dataset.e;
    est.espectro.has(e) ? est.espectro.delete(e) : est.espectro.add(e);
    vista = null; est.limite = PAGINA; desenha();
  };
  const partidos = [...new Set(PESSOAS.map(p=>p.partidoAtual).filter(Boolean))].sort();
  el("fPartido").innerHTML = '<option value="">todos</option>' +
    partidos.map(p=>`<option>${p}</option>`).join("");
  const ufs = [...new Set(PESSOAS.map(p=> p[UF]>=0 ? M.ufs[p[UF]] : null)
    .filter(Boolean))].sort();
  el("fUf").innerHTML = '<option value="">todas</option>' +
    ufs.map(u=>`<option>${u}</option>`).join("");

  // busca: addEventListener em vez de oninput (não se perde se algo
  // reatribuir a propriedade), e um respiro de 90ms para que digitar rápido
  // não dispare 2.347 pontos a cada tecla
  let tBusca = 0;
  const campo = el("q");
  const aoBuscar = e=>{
    est.q = e.target.value;
    est.vistaSuja = true;
    clearTimeout(tBusca);
    tBusca = setTimeout(()=>{ vista = null; est.limite = PAGINA; desenha(); }, 90);
  };
  campo.addEventListener("input", aoBuscar);
  campo.addEventListener("search", aoBuscar);   // o "x" nativo do type=search

  el("fPartido").onchange = e=>{ est.partido = e.target.value; vista=null; est.limite = PAGINA; desenha(); };
  el("fUf").onchange = e=>{ est.uf = e.target.value; vista=null; est.limite = PAGINA; desenha(); };

  const POSICOES = [["","ambos"],["sim","sim"],["nao","não"]];
  el("recortes").innerHTML = RECORTES.map(r=>
    `<div class="tri" role="radiogroup" aria-label="${r.rotulo}" data-r="${r.id}">
       <span class="tri-rot">${r.rotulo}</span>
       <div class="tri-ops">${POSICOES.map(([v,rot])=>
         `<button type="button" role="radio" data-v="${v}"
                  aria-checked="false" tabindex="-1">${rot}</button>`).join("")}
       </div>
     </div>`).join("");
  el("recortes").onclick = ev=>{
    const b = ev.target.closest("[data-v]"); if(!b) return;
    est[b.closest("[data-r]").dataset.r] = b.dataset.v;
    vista = null; est.limite = PAGINA; desenha();
  };
  // seta anda entre as posições, como manda um radiogroup
  el("recortes").onkeydown = ev=>{
    const passo = ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1
                : ev.key === "ArrowLeft" || ev.key === "ArrowUp" ? -1 : 0;
    if(!passo) return;
    const b = ev.target.closest("[data-v]"); if(!b) return;
    ev.preventDefault();
    const irmaos = [...b.parentElement.children];
    const alvo = irmaos[(irmaos.indexOf(b) + passo + irmaos.length) % irmaos.length];
    alvo.focus(); alvo.click();
  };
  el("limpar").onclick = ()=>{
    Object.assign(est,{q:"",espectro:new Set(),partido:"",uf:"",
      empresa:"",acima:""});
    vista = null; est.limite = PAGINA; est.ordem = 'multiplo'; sincronizaControles(); desenha();
  };
  el("gaveta").onclick = ()=>{
    const r = el("rail"), aberto = r.dataset.aberto === "true";
    r.dataset.aberto = String(!aberto);
    el("gaveta").setAttribute("aria-expanded", String(!aberto));
  };
  document.querySelectorAll(".aba").forEach(b=> b.onclick = ()=> trocaAba(b.dataset.aba));
  el("btnTema").onclick = ()=>{
    const atual = document.documentElement.getAttribute("data-theme");
    const escuro = atual ? atual === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", escuro ? "light" : "dark");
    desenha();
  };
}
function sincronizaControles(){
  // só escreve no campo quando difere: reatribuir o mesmo valor joga o cursor
  // para o fim e atrapalha quem está corrigindo o meio da palavra
  const campo = el("q");
  if(campo.value !== est.q) campo.value = est.q;
  const nFiltros = est.espectro.size + (est.partido?1:0) + (est.uf?1:0)
    + RECORTES.filter(r=> est[r.id]).length;
  const selo = el("gavetaSelo");
  if(selo) selo.textContent = nFiltros ? `${nFiltros} ativo${nFiltros>1?"s":""}` : "nenhum";
  // a aba corrente vira atributo no body: é por ela que o CSS decide, em
  // coluna única, se o palco ou o rail com a lista está à mostra
  document.body.dataset.aba = est.aba;
  el("fPartido").value = est.partido;
  el("fUf").value = est.uf;
  RECORTES.forEach(r=>{
    const g = document.querySelector(`[data-r="${r.id}"]`); if(!g) return;
    g.querySelectorAll("[data-v]").forEach(b=>{
      const marcado = b.dataset.v === est[r.id];
      b.setAttribute("aria-checked", marcado);
      // só a posição corrente entra na ordem de tabulação, como num radiogroup
      b.tabIndex = marcado ? 0 : -1;
    });
  });
  document.querySelectorAll("[data-e]").forEach(b=>
    b.setAttribute("aria-pressed", est.espectro.has(b.dataset.e)));
  document.querySelectorAll(".aba").forEach(b=>
    b.setAttribute("aria-selected", b.dataset.aba === est.aba));
}

/* ── dica flutuante ─────────────────────────────────────────────────────── */
const dica = el("dica");
function mostraDica(html, x, y){
  dica.innerHTML = html; dica.style.opacity = "1";
  const r = dica.getBoundingClientRect();
  dica.style.left = Math.min(x + 14, innerWidth - r.width - 8) + "px";
  dica.style.top = Math.max(8, y - r.height - 12) + "px";
}
const escondeDica = ()=> dica.style.opacity = "0";

/* ── cartão do toque ────────────────────────────────────────────────────── */
/* A dica flutuante depende de hover, que no dedo não existe: o primeiro toque
   já era o clique, e o dossiê abria sem que se soubesse em quem o dedo tinha
   acertado — num amontoado de 1.025 pontos, quase sempre em outra pessoa.
   Aqui o toque primeiro identifica, e abrir a ficha é um segundo gesto,
   deliberado. */
const cartao = el("cartao");
let cartaoAlvo = null;
let repintaPanorama = null;   // preenchido pelo panorama enquanto está montado

function fechaCartao(){
  const tinha = cartaoAlvo;
  cartao.hidden = true; cartaoAlvo = null;
  // o ponto do cartão fica anelado no gráfico; sumindo o cartão, some o anel
  if(tinha && repintaPanorama && el("cv")) repintaPanorama();
}
function mostraCartao(p, x, y){
  cartaoAlvo = p;
  cartao.innerHTML = `
    <span class="nome">${p[NOME]}</span>
    <div class="linha">${p.partidoAtual||"—"} · ${p[UF]>=0?M.ufs[p[UF]]:"—"}</div>
    <div class="linha">declara ${brl(p.patrimonio)}</div>
    <div class="linha" style="color:${corMult(p.multiplo)}">cresceu ${
      mult(p.multiplo)} o subsídio</div>
    ${p[EMP]?`<div class="linha">${p[EMP]} empresa${p[EMP]>1?"s":""}</div>`:""}
    <div class="acoes">
      <button class="bt" type="button" data-acao="abrir">abrir ficha</button>
      <button class="bt" type="button" data-acao="fechar">fechar</button>
    </div>`;
  cartao.hidden = false;
  const r = cartao.getBoundingClientRect();
  const acima = y - r.height - 16;
  cartao.style.left = Math.min(Math.max(8, x - r.width/2),
                               Math.max(8, innerWidth - r.width - 8)) + "px";
  cartao.style.top = (acima > 8 ? acima
    : Math.min(y + 20, Math.max(8, innerHeight - r.height - 8))) + "px";
  cartao.onclick = ev=>{
    const b = ev.target.closest("[data-acao]"); if(!b) return;
    const i = p.i;
    fechaCartao();
    if(b.dataset.acao === "abrir") abrePessoa(i);
  };
}

/* ── lista lateral ──────────────────────────────────────────────────────── */

/* Miniatura da trajetória. Normalizada por pessoa: interessa a forma —
   subiu, caiu, deu salto —, porque a magnitude já está no múltiplo ao lado.
   Ponto final destacado; declaração de ano ainda incompleto sai vazada. */
function faisca(p){
  const v = p[PTS].map(x=>x[TOTAL]);
  const L = 52, A = 17, m = 2.5;
  if(v.length < 2){
    return `<svg class="spark" width="${L}" height="${A}" aria-hidden="true">
      <circle cx="${L-m}" cy="${A/2}" r="2.2" fill="var(--ink3)"/></svg>`;
  }
  const lo = Math.min(...v), hi = Math.max(...v), amp = hi-lo;
  const px = i => m + i/(v.length-1)*(L-2*m);
  const py = x => amp ? (A-m) - (x-lo)/amp*(A-2*m) : A/2;
  const d = v.map((x,i)=>`${px(i).toFixed(1)},${py(x).toFixed(1)}`).join("L");
  const cor = p.multiplo === null ? "var(--ink3)"
            : p.multiplo > 1 ? "var(--acima)" : "var(--abaixo)";
  const ult = p[PTS][p[PTS].length-1];
  return `<svg class="spark" width="${L}" height="${A}" aria-hidden="true">
    <path d="M${d}" fill="none" stroke="${cor}" stroke-width="1.4"
          stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>
    <circle cx="${px(v.length-1).toFixed(1)}" cy="${py(v[v.length-1]).toFixed(1)}"
            r="2.4" fill="${ult[FLAGS]&F_ANO_PARCIAL?"var(--surface)":cor}"
            stroke="${cor}" stroke-width="1.2"/></svg>`;
}

const ORDENS = {
  // quem não tem régua comparável vai para o fim: "—" no topo é a linha que
  // menos informa. O sinal aqui estava invertido e enchia a abertura da lista
  // de gente com uma declaração só.
  multiplo:   ["múltiplo do subsídio", (a,b)=> (a.multiplo===null)-(b.multiplo===null)
                                              || b.multiplo-a.multiplo],
  patrimonio: ["patrimônio declarado",  (a,b)=> b.patrimonio - a.patrimonio],
  crescimento:["variação em reais",     (a,b)=> b.crescimento - a.crescimento],
  empresas:   ["número de empresas",    (a,b)=> b[EMP]-a[EMP] || b.patrimonio-a.patrimonio],
  declaracoes:["declarações na série",  (a,b)=> b[PTS].length-a[PTS].length],
  nome:       ["nome",                  (a,b)=> a.chave.localeCompare(b.chave)],
};

function desenhaLista(res){
  const total = PESSOAS.length;
  const pct = total ? Math.round(res.length/total*100) : 0;
  el("contagem").innerHTML =
    `<b>${nf.format(res.length)}</b> de ${nf.format(total)} pessoas`
    + `<span class="pct">${pct}%</span>`
    + `<span class="bar" aria-hidden="true"><i style="width:${pct}%"></i></span>`
    + `<span class="quebra"></span>`
    + `<span>${nf.format(res.reduce((s,p)=>s+p[PTS].length,0))} declarações</span>`;
  // no celular a lista está atrás de uma aba: o número tem de aparecer nela,
  // senão o filtro parece não ter surtido efeito nenhum
  const selo = el("abaListaN");
  if(selo) selo.textContent = nf.format(res.length);

  const sel = el("fOrdem");
  if(sel && sel.dataset.pronto !== "1"){
    sel.innerHTML = Object.entries(ORDENS)
      .map(([k,[r]])=>`<option value="${k}">${r}</option>`).join("");
    sel.dataset.pronto = "1";
    sel.onchange = e=>{ est.ordem = e.target.value; est.limite = PAGINA; desenha(); };
  }
  if(sel) sel.value = est.ordem;

  const lista = el("lista");
  if(!res.length){
    lista.innerHTML = `<p class="nada">Nenhuma pessoa com esses filtros.
      Tente afrouxar o recorte ou <b>limpar os filtros</b>.</p>`;
    return;
  }

  const ord = res.slice().sort(ORDENS[est.ordem][1]);
  const visiveis = ord.slice(0, est.limite);
  lista.innerHTML = visiveis.map(p=>{
    const meta = [p[UF]>=0?M.ufs[p[UF]]:"—", p.partidoAtual||"—",
                  `${p[PTS].length} decl.`];
    if(p[EMP]) meta.push(`${p[EMP]} empr.`);
    return `<button class="item" type="button" data-i="${p.i}" data-e="${p[ESP]}"
      ${est.sel===p.i?'aria-current="true"':""}>
      <span class="nm">${p[NOME]}</span>
      <span class="mult" style="color:${corMult(p.multiplo)}">${mult(p.multiplo)}</span>
      <span class="sub">${meta.join(" · ")}</span>
      ${faisca(p)}
    </button>`;}).join("")
    + (ord.length > est.limite
      ? `<button class="mais" type="button" id="verMais">mostrar mais ${
          nf.format(Math.min(PAGINA, ord.length-est.limite))} de ${
          nf.format(ord.length-est.limite)} restantes</button>` : "");

  const btMais = el("verMais");
  if(btMais) btMais.onclick = ()=>{ est.limite += PAGINA; desenhaLista(filtra()); };

  lista.onclick = ev=>{
    const b = ev.target.closest("[data-i]"); if(!b) return;
    abrePessoa(+b.dataset.i);
  };
  // navegação por teclado: setas percorrem, Enter/Espaço abrem
  lista.onkeydown = ev=>{
    if(ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    const itens = [...lista.querySelectorAll(".item")];
    const i = itens.indexOf(ev.target.closest(".item"));
    if(i < 0) return;
    ev.preventDefault();
    const alvo = itens[i + (ev.key === "ArrowDown" ? 1 : -1)];
    if(alvo) alvo.focus();
  };
}

/* ── panorama: dispersão em canvas, com zoom e arraste ──────────────────── */
// A vista é guardada em coordenadas de dado — x em log10 de reais, y em
// múltiplos do subsídio — e não em pixels. Isso é o que permite ampliar sem
// aparar valor nenhum: ponto fora da janela some da vista em vez de virar
// fileira falsa colada na borda, que era o defeito da primeira versão.
let vista = null;

/* Moldura padrão, fixa. Ela não muda quando os filtros mudam, e é isso que
   permite comparar dois recortes de cabeça: a linha de 1× fica sempre na
   mesma altura da tela, e as marcas do eixo caem sempre em R$ 1 mil, 10 mil,
   100 mil, 1 mi, 10 mi. Ajustar automaticamente aos dados de cada filtro
   parecia mais esperto e era pior — o gráfico se remexia a cada clique. Quem
   quiser o ajuste tem o botão "ajustar aos dados". */
const VISTA_PADRAO = {x0:3, x1:7.9, y0:-1.5, y1:8};
function vistaInicial(){ return {...VISTA_PADRAO}; }

function vistaAjustada(com){
  if(!com.length) return vistaInicial();
  const xs = com.map(p=> Math.log10(Math.max(p.patrimonio,1e3))).sort((a,b)=>a-b);
  const ys = com.map(p=> p.multiplo).sort((a,b)=>a-b);
  const q = (a,f)=> a[Math.min(a.length-1, Math.max(0, Math.floor(a.length*f)))];
  const y0 = Math.min(-0.5, q(ys,0.01)), y1 = Math.max(2, q(ys,0.985));
  const mx = (q(xs,0.995)-q(xs,0.005))*0.04 || .2;
  return {x0:q(xs,0.005)-mx, x1:q(xs,0.995)+mx,
          y0:y0-(y1-y0)*0.06, y1:y1+(y1-y0)*0.10};
}

/* Passo de grade da escada 1-2-5: em qualquer nível de zoom as marcas caem em
   número redondo, nunca em 0,37×. */
function passoBonito(amp, alvo){
  const bruto = amp/alvo;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const n = bruto/p;
  return (n<1.5 ? 1 : n<3 ? 2 : n<7 ? 5 : 10) * p;
}

/* No toque, mover o gráfico com um dedo e rolar a página são o mesmo gesto, e
   o gráfico ocupa quase a tela inteira: quem tentava descer a página ficava
   preso arrastando a nuvem de pontos. Por padrão o dedo rola a página
   (touch-action:pan-y) e só toca em pontos; quem quiser mover a vista liga o
   modo explorar, e aí o canvas passa a ficar com o gesto. */
let explorar = false;

function panorama(res){
  const alvo = el("palcoConteudo");
  const toque = matchMedia("(pointer:coarse)").matches;
  alvo.innerHTML = `
    <div class="quadro">
      <div class="ferramentas">
        <button class="bt" id="zMais" type="button" aria-label="aproximar">+</button>
        <button class="bt" id="zMenos" type="button" aria-label="afastar">−</button>
        <button class="bt" id="zReset" type="button">moldura padrão</button>
        <button class="bt" id="zAjusta" type="button">ajustar aos dados</button>
        ${toque?`<button class="bt" id="zDedo" type="button"
           aria-pressed="${explorar}">${explorar?"voltar a rolar":"mover com o dedo"}</button>`:""}
        <span class="dizer" id="zDizer"></span>
      </div>
      <canvas id="cv"></canvas>
      <div class="legenda">
        <span><i class="swatch" style="background:#b2544f"></i>esquerda</span>
        <span><i class="swatch" style="background:#8a8f7e"></i>centro</span>
        <span><i class="swatch" style="background:var(--abaixo)"></i>direita</span>
        <span><i class="swatch" style="background:var(--neutro)"></i>sem classificação</span>
        <span>tamanho do ponto = número de empresas</span>
        <span>${toque
          ? (explorar ? "um dedo move · dois dedos ampliam · toque num ponto para ver quem é"
                      : "toque num ponto para ver quem é · role a página por cima do gráfico")
          : "role para ampliar · arraste para mover"}</span>
      </div>
    </div>`;
  const cv = el("cv"), ctx = cv.getContext("2d");
  cv.style.touchAction = explorar ? "none" : "pan-y";
  const css = getComputedStyle(document.documentElement);
  const cor = n => css.getPropertyValue(n).trim();

  const com = res.filter(p=> p.multiplo !== null);
  const sem = res.length - com.length;
  const estreito = estreitaTela();
  // o canvas acompanha a janela em vez de ter altura fixa, para o palco
  // esticado não deixar faixa morta embaixo do gráfico
  const ALT = Math.max(estreito ? 320 : 420,
                       Math.min(innerHeight - (estreito ? 300 : 230), 900));
  if(!vista) vista = vistaInicial();

  let geo = null;   // preenchido a cada pintura, usado pelo apontamento

  function pinta(){
    const dpr = devicePixelRatio || 1;
    const L = cv.clientWidth || 600, A = ALT;
    cv.width = L*dpr; cv.height = A*dpr; cv.style.height = A+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,L,A);

    const mE = estreito ? 46 : 64, mD = 14, mT = 16, mB = estreito ? 44 : 52;
    const x0=mE, x1=L-mD, y0=mT, y1=A-mB;
    const px = v => x0 + (Math.log10(Math.max(v,1))-vista.x0)/(vista.x1-vista.x0)*(x1-x0);
    const py = v => y1 - (v-vista.y0)/(vista.y1-vista.y0)*(y1-y0);
    const ix = p => Math.pow(10, vista.x0 + (p-x0)/(x1-x0)*(vista.x1-vista.x0));
    const iy = p => vista.y0 + (y1-p)/(y1-y0)*(vista.y1-vista.y0);
    geo = {x0,x1,y0,y1,px,py,ix,iy};

    ctx.save();
    ctx.beginPath(); ctx.rect(x0,y0,x1-x0,y1-y0); ctx.clip();

    ctx.font = '11px ui-monospace,Menlo,monospace';
    ctx.lineWidth = 1;
    // grade horizontal: passo escolhido pela amplitude visível
    const passo = passoBonito(vista.y1-vista.y0, estreito ? 5 : 7);
    ctx.strokeStyle = cor("--rule");
    for(let v=Math.ceil(vista.y0/passo)*passo; v<=vista.y1; v+=passo){
      const y = Math.round(py(v))+.5;
      ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    }
    // grade vertical: uma linha por década de reais
    for(let e=Math.ceil(vista.x0); e<=vista.x1; e++){
      const x = Math.round(px(Math.pow(10,e)))+.5;
      ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.stroke();
    }
    // a régua: a linha de 1×
    if(1>=vista.y0 && 1<=vista.y1){
      const yr = Math.round(py(1))+.5;
      ctx.strokeStyle = cor("--ink2"); ctx.setLineDash([5,4]);
      ctx.beginPath(); ctx.moveTo(x0,yr); ctx.lineTo(x1,yr); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cor("--ink2"); ctx.textAlign="left"; ctx.textBaseline="bottom";
      ctx.fillText(estreito ? "1× — o que o cargo pagou"
        : "1× — cresceu exatamente o que o cargo pagou", x0+6, yr-5);
    }

    const CORES = [cor("--acima"),"#8a8f7e",cor("--abaixo")];
    let fora = 0;
    com.forEach(p=>{
      const cx = px(p.patrimonio), cy = py(p.multiplo);
      p._x = cx; p._y = cy;
      if(cx<x0-8 || cx>x1+8 || cy<y0-8 || cy>y1+8){ fora++; p._vis=false; return; }
      p._vis = true;
      const r = (estreito?1.9:2.2) + Math.min(p[EMP],9)*.42;
      p._r = r;
      const anelado = est.sel === p.i || (cartaoAlvo && cartaoAlvo.i === p.i);
      ctx.beginPath(); ctx.arc(cx,cy,r,0,6.284);
      ctx.fillStyle = p[ESP] >= 0 ? CORES[p[ESP]] : cor("--neutro");
      ctx.globalAlpha = anelado ? 1 : .62;
      ctx.fill();
      if(anelado){
        ctx.globalAlpha=1; ctx.strokeStyle=cor("--ink"); ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(cx,cy,r+3.5,0,6.284); ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // rótulos dos eixos, fora da área recortada
    ctx.font = '11px ui-monospace,Menlo,monospace';
    ctx.fillStyle = cor("--ink3");
    ctx.textAlign="right"; ctx.textBaseline="middle";
    for(let v=Math.ceil(vista.y0/passo)*passo; v<=vista.y1; v+=passo){
      const casas = passo>=1 ? 0 : passo>=.1 ? 1 : 2;
      const t = (Math.abs(v)<1e-9?0:v).toFixed(casas).replace(".",",");
      ctx.fillText(t+"×", x0-7, py(v));
    }
    ctx.textAlign="center"; ctx.textBaseline="top";
    const ESCALA = {3:"1 mil",4:"10 mil",5:"100 mil",6:"1 mi",7:"10 mi",8:"100 mi"};
    for(let e=Math.ceil(vista.x0); e<=vista.x1; e++){
      if(ESCALA[e]) ctx.fillText(ESCALA[e], px(Math.pow(10,e)), y1+7);
    }
    ctx.textAlign="left";
    ctx.fillText(estreito ? "patrimônio declarado →"
      : "patrimônio declarado no registro mais recente →", x0, y1+24);

    const partes = [];
    if(fora) partes.push(fora+" fora da vista");
    if(sem) partes.push(sem+" sem régua");
    const dz = el("zDizer");
    if(dz) dz.textContent = `${com.length} no gráfico`
      + (partes.length ? " · "+partes.join(" · ") : "");
  }
  pinta();
  repintaPanorama = pinta;

  /* zoom: mantém fixo o ponto sob o cursor */
  function amplia(fator, ancX, ancY, adiar){
    if(!geo) return;
    const ax = geo.ix(ancX), ay = geo.iy(ancY);
    const lx = Math.log10(Math.max(ax,1));
    const nx = (vista.x1-vista.x0)*fator, ny = (vista.y1-vista.y0)*fator;
    if(nx < .05 || nx > 12) return;
    const fx = (lx-vista.x0)/(vista.x1-vista.x0), fy = (ay-vista.y0)/(vista.y1-vista.y0);
    vista = {x0:lx-fx*nx, x1:lx+(1-fx)*nx, y0:ay-fy*ny, y1:ay+(1-fy)*ny};
    if(!adiar) pinta();
  }
  /* deslocamento em pixels de tela, convertido para coordenadas de dado */
  function move(dx, dy, adiar){
    if(!geo) return;
    const ex = (vista.x1-vista.x0)/(geo.x1-geo.x0), ey = (vista.y1-vista.y0)/(geo.y1-geo.y0);
    vista = {x0:vista.x0-dx*ex, x1:vista.x1-dx*ex,
             y0:vista.y0+dy*ey, y1:vista.y1+dy*ey};
    if(!adiar) pinta();
  }
  cv.addEventListener("wheel", ev=>{
    ev.preventDefault();
    const r = cv.getBoundingClientRect();
    fechaCartao();
    amplia(Math.exp(ev.deltaY*0.0016), ev.clientX-r.left, ev.clientY-r.top);
  }, {passive:false});
  const meio = ()=> geo ? [(geo.x0+geo.x1)/2, (geo.y0+geo.y1)/2] : [0,0];
  el("zMais").onclick = ()=>{ fechaCartao(); amplia(0.7, ...meio()); };
  el("zMenos").onclick = ()=>{ fechaCartao(); amplia(1/0.7, ...meio()); };
  el("zReset").onclick = ()=>{ fechaCartao(); vista = vistaInicial(); pinta(); };
  el("zAjusta").onclick = ()=>{ fechaCartao(); vista = vistaAjustada(com); pinta(); };
  const btDedo = el("zDedo");
  if(btDedo) btDedo.onclick = ()=>{
    explorar = !explorar;
    cv.style.touchAction = explorar ? "none" : "pan-y";
    btDedo.textContent = explorar ? "voltar a rolar" : "mover com o dedo";
    btDedo.setAttribute("aria-pressed", String(explorar));
    const leg = btDedo.closest(".quadro").querySelector(".legenda span:last-child");
    if(leg) leg.textContent = explorar
      ? "um dedo move · dois dedos ampliam · toque num ponto para ver quem é"
      : "toque num ponto para ver quem é · role a página por cima do gráfico";
  };

  /* Um dedo: rola a página (ou move a vista, no modo explorar). Dois dedos:
     move e amplia junto, com a pinça ancorada no ponto médio. Mouse: arrasta
     como sempre. */
  const pts = new Map();
  let base = null;
  cv.addEventListener("pointerdown", ev=>{
    // capturar o toque tira do navegador a rolagem que ele ia fazer; só vale
    // quando o gesto é mesmo nosso
    if(ev.pointerType !== "touch" || explorar){
      try{ cv.setPointerCapture(ev.pointerId); }catch(e){}
    }
    pts.set(ev.pointerId, {x:ev.clientX, y:ev.clientY,
                           x0:ev.clientX, y0:ev.clientY, moveu:0});
    base = null;
  });
  cv.addEventListener("pointermove", ev=>{
    const a = pts.get(ev.pointerId); if(!a){ aponta(ev); return; }
    const dx = ev.clientX-a.x, dy = ev.clientY-a.y;
    a.moveu += Math.abs(dx)+Math.abs(dy);
    a.x = ev.clientX; a.y = ev.clientY;
    if(pts.size === 2){
      const [p1,p2] = [...pts.values()];
      const d = Math.hypot(p1.x-p2.x, p1.y-p2.y);
      const cx = (p1.x+p2.x)/2, cy = (p1.y+p2.y)/2;
      if(base){
        const r = cv.getBoundingClientRect();
        fechaCartao();
        move(cx-base.cx, cy-base.cy, true);
        amplia(base.d/d, cx-r.left, cy-r.top);
      }
      base = {d, cx, cy};
      return;
    }
    // um dedo fora do modo explorar é rolagem da página, não arraste do gráfico
    if(ev.pointerType === "touch" && !explorar) return;
    fechaCartao();
    move(dx, dy);
  });
  function solta(ev){
    const a = pts.get(ev.pointerId);
    pts.delete(ev.pointerId); base = null;
    if(!a || a.moveu >= 8) return;
    // toque parado conta como clique. No dedo ele identifica o ponto e oferece
    // a ficha; no mouse, que já teve a dica no hover, abre direto.
    const r = cv.getBoundingClientRect();
    const achou = acha(ev.clientX-r.left, ev.clientY-r.top, ev.pointerType);
    if(ev.pointerType === "touch"){
      if(achou){ mostraCartao(achou, ev.clientX, ev.clientY); pinta(); }
      else fechaCartao();
    } else if(achou) abrePessoa(achou.i);
  }
  cv.addEventListener("pointerup", solta);
  cv.addEventListener("pointercancel", ev=>{ pts.delete(ev.pointerId); base=null; });

  /* Ponto mais próximo dentro da tolerância. No dedo ela é bem maior: a ponta
     do dedo cobre uns 40px, e os pontos têm 2px de raio. */
  function acha(mx, my, tipo){
    const tol = tipo === "touch" ? 22*22 : 12*12;
    let achou = null, melhor = tol;
    for(const p of com){
      if(!p._vis) continue;
      const d = (p._x-mx)**2 + (p._y-my)**2;
      if(d < melhor){ melhor = d; achou = p; }
    }
    return achou;
  }
  function aponta(ev){
    const r = cv.getBoundingClientRect();
    const achou = acha(ev.clientX-r.left, ev.clientY-r.top, ev.pointerType);
    cv._alvo = achou;
    if(achou && ev.pointerType !== "touch"){
      cv.style.cursor = "pointer";
      mostraDica(`<b>${achou[NOME]}</b><br>${achou.partidoAtual||"—"} · ${
        achou[UF]>=0?M.ufs[achou[UF]]:"—"}<br>declara ${brl(achou.patrimonio)}<br>cresceu ${
        mult(achou.multiplo)} o subsídio${achou[EMP]?`<br>${achou[EMP]} empresa${
        achou[EMP]>1?"s":""}`:""}`, ev.clientX, ev.clientY);
    } else if(!achou){ escondeDica(); cv.style.cursor="grab"; }
  }
  cv.addEventListener("pointerleave", escondeDica);
  cv.addEventListener("dblclick", ()=>{ vista = vistaInicial(); pinta(); });
}

/* ── dossiê ─────────────────────────────────────────────────────────────── */
/* ── o detalhe do dossiê vem à parte ────────────────────────────────────── */
/* A composição de cada declaração (`comp`) e a lista de empresas aparecem só
   aqui, uma pessoa por vez, mas juntas eram 58% do dados.json: todo mundo
   baixava as duas para ver o panorama, que não usa nenhuma delas. O build as
   separa num segundo arquivo e diz o nome dele em `meta.dossies`. Elas entram
   na primeira vez que fazem falta — e, antes disso, num prefetch ocioso, para
   que o clique não espere por rede. Servido sem build, `meta.dossies` não
   existe, o detalhe já veio no primeiro fetch e nada aqui roda. */
let detalhePronto = !M.dossies, detalhePedido = null;
// marca de uma recarga já tentada, para não entrar em laço se ela não resolver
const RECARGA = "tse-bens-recarga";

function carregaDetalhe(){
  if(detalhePronto) return null;
  if(!detalhePedido){
    detalhePedido = fetch(M.dossies)
      .then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
      .then(function(det){
        /* O detalhe é indexado pela posição da pessoa no array, e a posição só
           vale dentro de uma mesma extração: entra e sai gente, e ela anda. Se
           um deploy novo entrar entre o dados.json que está na memória e este
           pedido — o service worker troca os arquivos por baixo —, casar os
           dois pela posição penduraria as empresas de uma pessoa na ficha de
           outra. Então não se adivinha: confere a versão e recarrega para
           pegar o par inteiro de uma vez. */
        if(det.v !== M.versao){
          if(!sessionStorage.getItem(RECARGA)){
            sessionStorage.setItem(RECARGA, "1");
            location.reload();
            return new Promise(()=>{});      // a página já vai embora
          }
          throw new Error("versão do detalhe não casa com a dos dados");
        }
        sessionStorage.removeItem(RECARGA);
        PESSOAS.forEach(p=>{
          const d = det.p[p.i];
          if(!d) return;
          p[LEMP] = d.e;
          p[PTS].forEach((pt,j)=> pt[COMP] = d.c[j] || 0);
        });
        detalhePronto = true;
      })
      .catch(err=>{ detalhePedido = null; throw err; });   // deixa tentar de novo
  }
  return detalhePedido;
}

/* Puxa o detalhe quando a linha estiver ociosa, para que abrir o primeiro
   dossiê não custe uma ida à rede. Se o clique chegar antes, `carregaDetalhe`
   devolve esta mesma promessa em vez de pedir de novo. */
function prefetchDetalhe(){
  if(detalhePronto) return;
  const ocioso = window.requestIdleCallback || (f=>setTimeout(f, 1200));
  ocioso(()=>{ const q = carregaDetalhe(); if(q) q.catch(()=>{}); });
}

function dossie(){
  const alvo = el("palcoConteudo");
  repintaPanorama = null;          // o canvas saiu do palco
  const p = est.sel !== null ? PESSOAS[est.sel] : null;
  // o botão de volta só existe em coluna única, onde a lista está atrás da aba
  const volta = `<button class="bt volta-lista" type="button" id="voltaLista"
    >← lista</button>`;
  if(!p){
    alvo.innerHTML = volta + `<p class="vazio">Escolha uma pessoa ${
      estreitaTela() ? "na aba <b>Lista</b>" : "na lista ao lado"}, ou toque
      num ponto do panorama, para ver a trajetória declarada dela.</p>`;
    ligaVolta();
    return;
  }
  /* A ficha inteira depende do detalhe — a composição e as empresas fazem parte
     dela —, então espera em vez de pintar meia ficha e completar depois. Na
     prática o prefetch já resolveu e este ramo não acontece; ele existe para o
     link direto (`#d=nome`) aberto com a rede lenta. */
  const espera = carregaDetalhe();
  if(espera){
    const quem = est.sel;
    const aindaAqui = ()=> est.aba === "dossie" && est.sel === quem;
    alvo.innerHTML = volta + `<p class="carregando">Carregando a ficha…</p>`;
    ligaVolta();
    espera.then(()=>{ if(aindaAqui()) dossie(); }, ()=>{
      if(!aindaAqui()) return;
      alvo.innerHTML = volta + `<p class="vazio">Não deu para carregar esta
        ficha. Em rede móvel instável isso costuma ser passageiro.</p>
        <button class="bt" type="button" id="tentaFicha">tentar de novo</button>`;
      ligaVolta();
      const b = el("tentaFicha");
      if(b) b.onclick = ()=> dossie();
    });
    return;
  }
  const pts = p[PTS];
  alvo.innerHTML = volta + `
    <div class="ficha">
      <h2>${p[NOME]}</h2>
      <span class="dado">${p[UF]>=0?M.ufs[p[UF]]:"—"} · <b>${p.partidoAtual||"—"}</b>${
        p[ESP]>=0?" · "+M.espectros[p[ESP]]:" · sem classificação"}</span>
      <span class="dado">declara <b>${brl(p.patrimonio)}</b></span>
      <span class="dado">variação <b style="color:${corMult(p.multiplo)}">${
        brl(p.crescimento)}</b>${p.multiplo!==null?` · ${mult(p.multiplo)} o subsídio`:""}</span>
      <span class="dado">${p.mandatos} mandato${p.mandatos===1?"":"s"}</span>
      ${p[EMP]?`<span class="dado">sócio de <b>${p[EMP]}</b> empresa${
        p[EMP]>1?"s":""} · capital ${brl(p[CAP])}</span>`:""}
      <button class="bt" id="copiaLink" type="button">copiar link desta ficha</button>
    </div>
    <div class="quadro"><div id="trajetoria"></div>
      <div class="legenda">
        <span><i class="swatch" style="background:var(--ink)"></i>patrimônio declarado</span>
        <span><i class="swatch" style="background:var(--abaixo)"></i>subsídio acumulado do mandato</span>
      </div>
    </div>
    <div class="quadro"><div id="composicao"></div>
      <div class="legenda">${M.categorias.map((c,i)=>
        `<span><i class="swatch" style="background:${CAT_COR[i]}"></i>${CAT_ROTULO[c]}</span>`
      ).join("")}</div>
    </div>
    ${(p[LEMP]||[]).length ? `<div class="quadro rolagem">
      <table><thead><tr>
        <th>empresa em que consta no quadro societário</th>
        <th>capital social</th>
      </tr></thead><tbody>${p[LEMP].map(e=>`<tr>
        <td class="empresa">${e[0]}</td><td>${e[1]?brl(e[1]):"—"}</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr><td>${p[LEMP].length} empresa${p[LEMP].length>1?"s":""}</td>
        <td>${brl(p[CAP])}</td></tr></tfoot></table>
      <p class="rodape">Quadro societário da Receita Federal, casado por nome e
      seis dígitos do CPF — é indício, não fato. O capital social é o declarado
      no contrato social, não faturamento nem participação desta pessoa.</p>
    </div>` : ""}
    <div class="quadro rolagem cartoes">
      <table><thead><tr>
        <th>eleição</th><th>cargo</th><th>partido</th><th>declarado</th>
        <th>variação</th><th>subsídio no período</th><th>múltiplo</th>
      </tr></thead><tbody>${pts.map((x,i)=>{
        const dv = i ? x[TOTAL]-pts[i-1][TOTAL] : null;
        const m = i && x[REGUA] ? dv/x[REGUA] : null;
        // data-rot: no celular a linha vira cartão e cada célula precisa
        // carregar o próprio rótulo, porque o cabeçalho da tabela some
        return `<tr>
          <td data-rot="eleição">${x[ANO]} ${x[FLAGS]&F_ELEITO?'<span class="tag t-eleito">eleito</span>':""}${
            x[FLAGS]&F_ANO_PARCIAL?' <span class="tag t-parcial">parcial</span>':""}</td>
          <td data-rot="cargo">${x[CARGO]>=0?M.cargos[x[CARGO]]:"—"}</td>
          <td data-rot="partido">${x[PART]>=0?M.partidos[x[PART]]:"—"}</td>
          <td data-rot="declarado">${brl(x[TOTAL])}</td>
          <td data-rot="variação">${dv===null?"—":brl(dv)}</td>
          <td data-rot="subsídio no período">${x[REGUA]?brl(x[REGUA]):"—"}${
            x[FLAGS]&F_REGUA_PARCIAL?' <span class="tag t-parcial">parcial</span>':""}</td>
          <td data-rot="múltiplo" style="color:${corMult(m)}">${m===null?"—":mult(m)}</td>
        </tr>`;}).join("")}</tbody></table>
    </div>`;
  ligaVolta();
  el("copiaLink").onclick = ev=>{
    const b = ev.currentTarget, volta = ()=> setTimeout(()=>{
      b.textContent = "copiar link desta ficha"; }, 2200);
    // clipboard só existe em contexto seguro; fora dele resta apontar a barra
    if(!navigator.clipboard){ b.textContent = "copie da barra de endereço"; return volta(); }
    navigator.clipboard.writeText(location.href)
      .then(()=>{ b.textContent = "link copiado"; })
      .catch(()=>{ b.textContent = "copie da barra de endereço"; })
      .then(volta);
  };
  trajetoria(el("trajetoria"), pts);
  composicao(el("composicao"), pts);
}
function ligaVolta(){
  const b = el("voltaLista");
  if(b) b.onclick = ()=> trocaAba("lista");
}

const SVG = "http://www.w3.org/2000/svg";
function svgEl(n, at){
  const e = document.createElementNS(SVG, n);
  for(const k in at) e.setAttribute(k, at[k]);
  return e;
}
/* Rótulos do eixo do tempo. Numa série de sete ou oito eleições eles se
   encavalam na largura de um telefone, então ali entram um sim, um não — com
   o primeiro e o último sempre presentes, que são os que ancoram a leitura. */
function eixoAnos(g, anos, px, y1, larg){
  const passo = anos.length > 1 && larg/(anos.length-1) < 34 ? 2 : 1;
  anos.forEach((a,i)=>{
    if(i % passo && i !== anos.length-1) return;
    const t = svgEl("text",{x:px(a), y:y1+18, "text-anchor":"middle",
      fill:"var(--ink3)", "font-size":11, "font-family":"var(--mono)"});
    t.textContent = a; g.appendChild(t);
  });
}
/* "R$ 1,2 mi" não cabe na margem de um eixo estreito; no gráfico o cifrão é
   redundante, porque a unidade já está dita na legenda. */
function brlCurto(v){
  const a = Math.abs(v), s = v<0 ? "−" : "";
  if(a >= 1e6) return s+(a/1e6).toFixed(a>=1e7?0:1).replace(".",",")+" mi";
  if(a >= 1e3) return s+Math.round(a/1e3)+" mil";
  return s+nf.format(Math.round(a));
}

function trajetoria(alvo, pts){
  const L = alvo.clientWidth || 720;
  const estreito = L < 520;
  const A = estreito ? 240 : 300;
  const mE = estreito ? 60 : 76, mD = estreito ? 12 : 22, mT = 16, mB = 34;
  const x0=mE, x1=L-mD, y0=mT, y1=A-mB;
  const anos = pts.map(x=>x[ANO]);
  const aMin = Math.min(...anos), aMax = Math.max(...anos);
  const px = a => aMax===aMin ? (x0+x1)/2
    : x0 + (a-aMin)/(aMax-aMin)*(x1-x0);
  // acumula a régua ao longo da série, para virar uma curva comparável
  let acc = 0; const regua = pts.map(x=> acc += (x[REGUA]||0));
  const vMax = Math.max(...pts.map(x=>x[TOTAL]), ...regua, 1);
  const py = v => y1 - (v/vMax)*(y1-y0);

  const s = svgEl("svg",{viewBox:`0 0 ${L} ${A}`, height:A,
                         role:"img","aria-label":"trajetória patrimonial"});
  // grade
  const linhas = estreito ? 3 : 4;
  for(let k=0;k<=linhas;k++){
    const v = vMax*k/linhas, y = py(v);
    s.appendChild(svgEl("line",{x1:x0,x2:x1,y1:y,y2:y,stroke:"var(--rule)"}));
    const t = svgEl("text",{x:x0-9,y:y+4,"text-anchor":"end",fill:"var(--ink3)",
      "font-size":11,"font-family":"var(--mono)"});
    t.textContent = k ? (estreito ? brlCurto(v) : brl(v)) : "0";
    s.appendChild(t);
  }
  // régua acumulada
  s.appendChild(svgEl("path",{d:"M"+pts.map((x,i)=>`${px(x[ANO])},${py(regua[i])}`)
    .join("L"), fill:"none", stroke:"var(--abaixo)", "stroke-width":2,
    "stroke-dasharray":"5 4"}));
  // patrimônio
  s.appendChild(svgEl("path",{d:"M"+pts.map(x=>`${px(x[ANO])},${py(x[TOTAL])}`)
    .join("L"), fill:"none", stroke:"var(--ink)", "stroke-width":2.4}));
  pts.forEach(x=>{
    const parcial = x[FLAGS] & F_ANO_PARCIAL;
    s.appendChild(svgEl("circle",{cx:px(x[ANO]), cy:py(x[TOTAL]), r:4.5,
      fill: parcial ? "var(--surface)" : "var(--ink)",
      stroke:"var(--ink)", "stroke-width":2}));
  });
  eixoAnos(s, pts.map(x=>x[ANO]), px, y1, x1-x0);
  alvo.innerHTML = ""; alvo.appendChild(s);
}

/* Composição em barras horizontais, uma por declaração, cada uma normalizada
   a 100%. Vertical e em escala absoluta, como estava antes, a pergunta "de
   que é feito este patrimônio" ficava ilegível: nas declarações pequenas as
   fatias viravam fios de um pixel. Aqui a proporção é sempre legível, e o
   valor absoluto vai ao lado, em texto. */
function composicao(alvo, pts){
  const L = alvo.clientWidth || 720;
  const estreito = L < 520;
  /* Numa tela estreita o ano à esquerda e o total à direita comiam metade da
     largura, e o total ainda vazava para fora do desenho. Ali os dois sobem
     para uma linha de texto em cima, e a barra fica com a largura toda — que
     é o que se veio ler. */
  const mE = estreito ? 0 : 52;             // ano
  const mD = estreito ? 0 : 104;            // total em reais
  const rot = estreito ? 17 : 0;            // altura da linha de texto acima
  const linha = estreito ? 26 : 30, gap = estreito ? 13 : 9, mT = 6;
  const x0 = mE, x1 = L - mD, larg = Math.max(x1-x0, 40);
  const alt = linha + gap + rot;
  const A = mT + pts.length*alt;

  const s = svgEl("svg",{viewBox:`0 0 ${L} ${A}`, height:A, role:"img",
    "aria-label":"composição do patrimônio declarado, por tipo de bem"});

  pts.forEach((x,i)=>{
    const y = mT + i*alt + rot;
    const comp = x[COMP] || [];
    const soma = comp.reduce((a,b)=>a+b, 0);

    if(estreito){
      const cab = svgEl("text",{x:x0, y:y-5, fill:"var(--ink2)",
        "font-size":12,"font-family":"var(--mono)"});
      cab.textContent = x[ANO] + " · " + (soma ? brl(soma) : "nada declarado")
        + (x[FLAGS]&F_ANO_PARCIAL ? " · parcial" : "");
      s.appendChild(cab);
    } else {
      const ano = svgEl("text",{x:x0-10, y:y+linha/2+4, "text-anchor":"end",
        fill:"var(--ink2)","font-size":12,"font-family":"var(--mono)"});
      ano.textContent = x[ANO]; s.appendChild(ano);
    }

    if(!soma){
      s.appendChild(svgEl("rect",{x:x0, y:y+linha/2-1, width:larg, height:2,
        fill:"var(--rule2)"}));
      if(!estreito){
        const nada = svgEl("text",{x:x0+larg+10, y:y+linha/2+4,
          fill:"var(--ink3)","font-size":11.5,"font-family":"var(--mono)"});
        nada.textContent = "nada declarado"; s.appendChild(nada);
      }
      return;
    }

    let acc = 0;
    M.categorias.forEach((c,k)=>{
      const v = comp[k] || 0; if(v <= 0) return;
      const frac = v/soma, w = frac*larg, cx = x0 + (acc/soma)*larg;
      acc += v;
      const r = svgEl("rect",{x:cx, y:y, width:Math.max(w,.7), height:linha,
        fill:CAT_COR[k]});
      const t = svgEl("title");
      t.textContent = `${x[ANO]} · ${CAT_ROTULO[c]}: ${brl(v)} (${
        (frac*100).toFixed(1).replace(".",",")}%)`;
      r.appendChild(t); s.appendChild(r);
      // o rótulo só entra quando cabe sem encavalar
      if(w > 34){
        const pct = svgEl("text",{x:cx+w/2, y:y+linha/2+4, "text-anchor":"middle",
          fill:"#fff","font-size":11,"font-family":"var(--mono)",
          "font-weight":"600"});
        pct.textContent = Math.round(frac*100)+"%";
        s.appendChild(pct);
      }
    });

    if(!estreito){
      const tot = svgEl("text",{x:x0+larg+10, y:y+linha/2+4, fill:"var(--ink2)",
        "font-size":11.5,"font-family":"var(--mono)"});
      tot.textContent = brl(soma)
        + (x[FLAGS]&F_ANO_PARCIAL ? " ·parcial" : "");
      s.appendChild(tot);
    }
  });
  alvo.innerHTML = ""; alvo.appendChild(s);
}

/* ── comparar ───────────────────────────────────────────────────────────── */
function comparar(){
  const alvo = el("palcoConteudo");
  const fx = est.fixados.map(i=>PESSOAS[i]).filter(Boolean);
  if(fx.length < 2){
    alvo.innerHTML = `<p class="vazio">Abra o dossiê de uma pessoa e use
      <b>fixar para comparar</b>. Com duas ou mais fixadas, as trajetórias
      aparecem sobrepostas aqui — em múltiplos do subsídio, para que gerações
      diferentes fiquem comparáveis.
      ${fx.length===1?`<br><br>Fixada até agora: ${fx[0][NOME]}.`:""}</p>`;
    return;
  }
  alvo.innerHTML = `<div class="quadro"><div id="cmp"></div>
    <div class="legenda" id="cmpLeg"></div></div>
    <div class="quadro rolagem"><table><thead><tr>
      <th>pessoa</th><th>declarações</th><th>primeiro</th><th>último</th>
      <th>variação</th><th>subsídio somado</th><th>múltiplo</th><th></th>
    </tr></thead><tbody>${fx.map(p=>`<tr>
      <td>${p[NOME]}</td><td>${p[PTS].length}</td>
      <td>${brl(p.primeiro[TOTAL])}</td><td>${brl(p.patrimonio)}</td>
      <td>${brl(p.crescimento)}</td>
      <td>${p.regua?brl(p.regua):"—"}</td>
      <td style="color:${corMult(p.multiplo)}">${mult(p.multiplo)}</td>
      <td><button class="chip" type="button" data-solta="${p.i}">soltar</button></td>
    </tr>`).join("")}</tbody></table></div>`;
  alvo.onclick = ev=>{
    const b = ev.target.closest("[data-solta]"); if(!b) return;
    est.fixados = est.fixados.filter(i=> i !== +b.dataset.solta); desenha();
  };
  const PALETA = ["#d1453b","#5d7f88","#c2683c","#6f8fa8","#8a8f7e","#9a7f9c"];
  el("cmpLeg").innerHTML = fx.map((p,i)=>
    `<span><i class="swatch" style="background:${PALETA[i]}"></i>${p[NOME]}</span>`).join("");

  const alvoG = el("cmp");
  const L = alvoG.clientWidth || 720, A = 340;
  const mE=68, mD=22, mT=16, mB=34;
  const x0=mE, x1=L-mD, y0=mT, y1=A-mB;
  const anos = [...new Set(fx.flatMap(p=>p[PTS].map(x=>x[ANO])))].sort();
  const aMin = anos[0], aMax = anos[anos.length-1];
  const px = a => aMax===aMin ? (x0+x1)/2 : x0+(a-aMin)/(aMax-aMin)*(x1-x0);

  // cada pessoa vira a curva do patrimônio dividido pela régua acumulada
  const series = fx.map(p=>{
    let acc = 0, base = p.primeiro[TOTAL];
    return p[PTS].map(x=>{
      acc += (x[REGUA]||0);
      return {ano:x[ANO], v: acc > 0 ? (x[TOTAL]-base)/acc : null};
    }).filter(d=> d.v !== null);
  });
  const vals = series.flat().map(d=>d.v);
  const vMax = Math.max(1.2, ...vals), vMin = Math.min(0, ...vals);
  const py = v => y1 - (v-vMin)/(vMax-vMin)*(y1-y0);

  const s = svgEl("svg",{viewBox:`0 0 ${L} ${A}`, height:A, role:"img",
    "aria-label":"comparação de trajetórias"});
  for(let k=0;k<=4;k++){
    const v = vMin + (vMax-vMin)*k/4, y = py(v);
    s.appendChild(svgEl("line",{x1:x0,x2:x1,y1:y,y2:y,stroke:"var(--rule)"}));
    const t = svgEl("text",{x:x0-9,y:y+4,"text-anchor":"end",fill:"var(--ink3)",
      "font-size":11,"font-family":"var(--mono)"});
    t.textContent = mult(v); s.appendChild(t);
  }
  const yr = py(1);
  s.appendChild(svgEl("line",{x1:x0,x2:x1,y1:yr,y2:yr,stroke:"var(--ink2)",
    "stroke-dasharray":"5 4"}));
  const rot = svgEl("text",{x:x0+6,y:yr-6,fill:"var(--ink2)","font-size":11,
    "font-family":"var(--mono)"});
  rot.textContent = "1× — o subsídio explica exatamente"; s.appendChild(rot);
  series.forEach((sr,i)=>{
    if(!sr.length) return;
    s.appendChild(svgEl("path",{d:"M"+sr.map(d=>`${px(d.ano)},${py(d.v)}`).join("L"),
      fill:"none", stroke:PALETA[i], "stroke-width":2.4}));
    sr.forEach(d=> s.appendChild(svgEl("circle",{cx:px(d.ano),cy:py(d.v),r:3.6,
      fill:PALETA[i]})));
  });
  anos.forEach(a=>{
    const t = svgEl("text",{x:px(a),y:y1+18,"text-anchor":"middle",
      fill:"var(--ink3)","font-size":11,"font-family":"var(--mono)"});
    t.textContent = a; s.appendChild(t);
  });
  alvoG.innerHTML = ""; alvoG.appendChild(s);
}

/* ── notas de leitura ───────────────────────────────────────────────────── */
el("notas").innerHTML = `
  <p><b>O que a régua mede.</b> O subsídio é bruto — antes de imposto de renda,
  previdência e de qualquer despesa de viver. Declarar menos do que o cargo pagou
  é o comportamento da maioria da Câmara, não anomalia. O múltiplo mede quanto da
  variação o salário <em>deixa</em> de explicar; é onde a checagem começa, não
  onde ela termina.</p>
  <p><b>Crescer acima da régua não é ilícito.</b> Parlamentar pode ter empresa,
  aluguel, herança, venda de bem, ganho de capital ou renda do cônjuge.</p>
  <p><b>Os valores são nominais.</b> A declaração do TSE segue a regra do imposto
  de renda e registra bens pelo custo de aquisição: imóvel comprado em 1990 segue
  declarado a preço de 1990. Por isso nada aqui é corrigido pela inflação —
  corrigir seria introduzir um valor que a declaração não afirma.</p>
  <p><b>A régua só conta mandato federal.</b> ${M.ressalvas.regua}</p>
  <p><b>Empresas são indício, não fato.</b> ${M.ressalvas.empresas}</p>
  <p><b>2026 está incompleto.</b> ${M.ressalvas["2026"]}</p>
  <p><b>Ausência não é omissão.</b> ${M.ressalvas.ausencia}</p>
  <p style="color:var(--ink3)">Universo: ${M.universo}. ${nf.format(M.pessoas)}
  pessoas, ${nf.format(M.declaracoes)} declarações. Fontes: Tribunal Superior
  Eleitoral (declarações de bens dos registros de candidatura), Câmara dos
  Deputados (decretos legislativos que fixaram o subsídio) e Receita Federal
  (quadro societário). Dados extraídos em ${M.gerado}.</p>`;

/* ── ciclo ──────────────────────────────────────────────────────────────── */
const TITULO = document.title;

function desenha(empurra){
  fechaCartao();
  sincronizaControles();
  const res = filtra();
  desenhaLista(res);
  // na aba lista o palco está escondido pelo CSS: pintar 1.025 pontos ali
  // seria trabalho jogado fora, e o que já estava montado espera a volta
  if(est.aba === "panorama") panorama(res);
  else if(est.aba !== "lista") dossie();
  // o nome no título faz o link colado, a aba e o histórico dizerem de quem
  // é a ficha antes de a página abrir
  document.title = est.sel !== null && PESSOAS[est.sel]
    ? `${PESSOAS[est.sel][NOME]} — ${TITULO}` : TITULO;
  gravaHash(empurra);
}

/* Abrir uma pessoa é o único gesto que vira entrada de histórico: é o que se
   compartilha, e é o que o "voltar" deve desfazer. */
function abrePessoa(i){
  if(est.aba === "lista") rolagemLista = scrollY;
  est.sel = i; est.aba = "dossie"; desenha(true);
  // no celular o palco fica acima da lista: sem isto o dossiê abriria fora da
  // tela e o clique pareceria não ter feito nada
  if(estreitaTela()) rolaAoPalco();
}

/* Onde a lista estava quando se saiu dela. Sem guardar, quem abre a décima
   ficha e volta cai no topo e tem de rolar tudo de novo para chegar na
   décima primeira. */
let rolagemLista = 0;

function rolaAoPalco(){
  const alvo = document.querySelector(".palco");
  if(alvo) alvo.scrollIntoView({block:"start",
    behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
      ? "auto" : "smooth"});
}

function trocaAba(nova){
  if(nova === est.aba){ if(estreitaTela()) rolaAoPalco(); return; }
  if(est.aba === "lista") rolagemLista = scrollY;
  est.aba = nova;
  desenha();
  if(!estreitaTela()) return;
  if(nova === "lista" && rolagemLista) scrollTo({top:rolagemLista, behavior:"auto"});
  else rolaAoPalco();
}

// voltar/avançar do navegador e edição do endereço à mão caem aqui; o teste
// evita redesenhar quando o que mudou foi o próprio app escrevendo o endereço
function aplicaUrl(){
  if(location.hash === ultimaUrl) return;
  leHash(); desenha();
}

leHash();
montaControles();
desenha();
prefetchDetalhe();          // depois do primeiro desenho, na folga da linha
addEventListener("hashchange", aplicaUrl);
addEventListener("popstate", aplicaUrl);

/* Antes só o canvas se reinscrevia no resize; os gráficos do dossiê ficavam
   com a largura medida no primeiro desenho e, ao girar o aparelho, escalavam
   com sobra de um lado. Agora o redesenho é do painel inteiro — acionado por
   qualquer mudança de largura ou de altura, porque a altura do canvas depende
   da janela. O debounce absorve o chuveiro de eventos que o iOS dispara quando
   a barra de endereço encolhe durante a rolagem. */
let dimJanela = [innerWidth, innerHeight], tGiro = 0;
addEventListener("resize", ()=>{
  if(innerWidth === dimJanela[0] && innerHeight === dimJanela[1]) return;
  dimJanela = [innerWidth, innerHeight];
  clearTimeout(tGiro);
  tGiro = setTimeout(()=>{
    // a aba Lista não existe na tela larga: lá a lista está sempre ao lado
    if(!estreitaTela() && est.aba === "lista")
      est.aba = est.sel !== null ? "dossie" : "panorama";
    desenha();
  }, 150);
}, {passive:true});

// o cartão aponta um ponto do gráfico: rolar a página ou tocar em outro lugar
// o desfaz, senão ele fica flutuando apontando o nada
addEventListener("scroll", ()=>{ if(cartaoAlvo) fechaCartao(); }, {passive:true});
addEventListener("pointerdown", ev=>{
  if(!cartaoAlvo || cartao.contains(ev.target) || ev.target === el("cv")) return;
  fechaCartao();
}, true);
})
/* São 373 KB, e em rede móvel instável eles falham de vez em quando. Sem isto
   a página ficava muda: o esqueleto de carregamento girava para sempre e não
   havia como saber que a culpa não era da espera. */
.catch(function(err){
  console.error(err);
  const alvo = document.getElementById("palcoConteudo");
  if(!alvo) return;
  alvo.innerHTML = `<p class="vazio">Não deu para carregar as declarações.
    Em rede móvel instável isso costuma ser passageiro.</p>
    <button class="bt" type="button" id="tentaDeNovo">tentar de novo</button>`;
  const b = document.getElementById("tentaDeNovo");
  if(b) b.onclick = ()=> location.reload();
});
})();