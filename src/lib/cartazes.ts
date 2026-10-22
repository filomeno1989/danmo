/**
 * cartazes.ts - Cartazes de aniversario e de anos de casa.
 *
 * As FUNCOES PURAS (textos, modelos, nome de ficheiro, cores) correm
 * em qualquer lado e sao provadas pelo bun. O DESENHO corre so no
 * navegador: recebe o contexto 2D de um canvas de 1080x1080, a foto
 * do avatar (ou null, e desenha as iniciais) e desenha o cartaz todo,
 * pronto para exportar em PNG e partir para os grupos do WhatsApp.
 *
 * Tres modelos (os "exemplares" que o Filomeno pediu para escolher):
 * - festivo: fundo quente, confetti, festa;
 * - elegante: azul noite com ouro, solene;
 * - danmo: marca verde da empresa, limpo.
 * Cada um adapta o titular a ocasiao (aniversario / anos de casa).
 */

import { MESES } from "./rh";

export type OcasiaoCartaz = "aniversario" | "anosCasa";

export type ModeloCartaz = { id: "festivo" | "elegante" | "danmo"; label: string };

/** Os exemplares escolhiveis no estudio, pela ordem do seletor. */
export const MODELOS_CARTAZ: ModeloCartaz[] = [
  { id: "festivo", label: "Festivo" },
  { id: "elegante", label: "Elegante" },
  { id: "danmo", label: "Danmo" }
];

/** Titular grande do cartaz, conforme a ocasiao. */
export function titularCartaz(o: OcasiaoCartaz): string {
  return o === "aniversario" ? "Feliz Aniversário" : "Mais um ano de casa";
}

/** "faz 35 anos" / "35 anos de casa", com o singular do "1 ano". */
export function linhaAnos(o: OcasiaoCartaz, n: number): string {
  const anos = n === 1 ? "ano" : "anos";
  return o === "aniversario" ? `faz ${n} ${anos}` : `${n} ${anos} de casa`;
}

/** Data longa do portal: "2026-05-10" -> "10 de Maio de 2026". */
export function dataLongaCartaz(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  const mes = MESES[Number(m) - 1] || "";
  if (!mes) return "";
  return `${Number(d)} de ${mes} de ${a}`;
}

/** Rodape do cartaz com a etiqueta da empresa. */
export function rodapeCartaz(empresa: string | null | undefined): string {
  return empresa === "porto" ? "Danmo Porto" : empresa === "danmo" ? "Danmo" : "Grupo Danmo";
}

/** Mensagem que acompanha a imagem no WhatsApp. */
export function mensagemWhatsApp(o: OcasiaoCartaz, nome: string, n: number): string {
  if (o === "aniversario") {
    return `Feliz aniversário, ${nome}! A equipa da Danmo deseja-te um excelente dia.`;
  }
  const anos = n === 1 ? "ano" : "anos";
  return `Parabéns pelos teus ${n} ${anos} de casa, ${nome}! A equipa da Danmo está orgulhosa de ti.`;
}

/** "Filomeno Manuel" -> "cartaz-filomeno-manuel-aniversario.png". */
export function nomeFicheiroCartaz(o: OcasiaoCartaz, nome: string): string {
  const slug = (nome || "colaborador")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `cartaz-${slug || "colaborador"}-${o === "aniversario" ? "aniversario" : "anos-de-casa"}.png`;
}

/** Paleta HEX das iniciais (no canvas nao ha classes do tailwind). */
const PALETA_CARTAZ: { fundo: string; texto: string }[] = [
  { fundo: "#0e7a4f", texto: "#ffffff" },
  { fundo: "#b45309", texto: "#ffffff" },
  { fundo: "#0369a1", texto: "#ffffff" },
  { fundo: "#b91c1c", texto: "#ffffff" },
  { fundo: "#334155", texto: "#ffffff" }
];

/** Cor estável das iniciais: o mesmo nome vira sempre a mesma cor. */
export function corAvatarCartaz(nome: string): { fundo: string; texto: string } {
  let h = 0;
  for (const letra of nome || "x") h = (h * 31 + letra.charCodeAt(0)) % 997;
  return PALETA_CARTAZ[h % PALETA_CARTAZ.length];
}

/* ------------------------------------------------------------------
 * O desenho (so no navegador)
 * ------------------------------------------------------------------ */

export type OpcoesDesenho = {
  ocasiao: OcasiaoCartaz;
  modelo: ModeloCartaz["id"];
  nome: string;
  /** Anos que a pessoa faz / de casa (ja calculado na lista). */
  anos: number;
  /** AAAA-MM-DD do aniversario ou do inicio de servico. */
  dataISO: string;
  empresa: string | null;
  foto: HTMLImageElement | null;
};

const L = 1080; // lado do cartaz quadrado

/** Letras iniciais do nome (a mesma regra das iniciais do quadro). */
function iniciaisDe(nome: string): string {
  const partes = (nome || "?").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] || "?";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] || "" : "";
  return (primeira + ultima).toUpperCase();
}

/** Pseudo-aleatorio deterministico: o mesmo nome espalha igual. */
function aleatorioSemente(semente: number): () => number {
  let s = semente % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function sementeDe(nome: string): number {
  let h = 7;
  for (const letra of nome || "x") h = (h * 31 + letra.charCodeAt(0)) % 100000;
  return h;
}

/** Desenha a foto recortada no circulo (corte "capa", centro ao topo). */
function desenharFotoCircular(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  raio: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, raio, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // escala com folga de 20%: o recorte viesado para cima (onde a cara
  // fica) nao pode deixar buraco na parte de baixo do circulo
  const escala = Math.max((raio * 2) / img.width, (raio * 2) / img.height) * 1.2;
  const w = img.width * escala;
  const h = img.height * escala;
  ctx.drawImage(img, cx - w / 2, cy - h * 0.58, w, h);
  ctx.restore();
}

/** Desenha o avatar: foto, ou iniciais na cor estavel. */
function desenharAvatar(
  ctx: CanvasRenderingContext2D,
  op: OpcoesDesenho,
  cx: number,
  cy: number,
  raio: number,
  corAnel: string,
  espessuraAnel: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, raio + espessuraAnel, 0, Math.PI * 2);
  ctx.fillStyle = corAnel;
  ctx.fill();
  if (op.foto && op.foto.width > 0) {
    desenharFotoCircular(ctx, op.foto, cx, cy, raio);
  } else {
    const cor = corAvatarCartaz(op.nome);
    ctx.beginPath();
    ctx.arc(cx, cy, raio, 0, Math.PI * 2);
    ctx.fillStyle = cor.fundo;
    ctx.fill();
    ctx.fillStyle = cor.texto;
    ctx.font = `bold ${Math.round(raio * 0.72)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(iniciaisDe(op.nome), cx, cy + raio * 0.04);
  }
  ctx.restore();
}

/** Parte o nome em linhas que caibam na largura (maximo 3 linhas). */
function partirNome(
  ctx: CanvasRenderingContext2D,
  nome: string,
  larguraMax: number
): string[] {
  const palavras = (nome || "?").trim().split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let actual = "";
  for (const p of palavras) {
    const teste = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(teste).width <= larguraMax || !actual) {
      actual = teste;
    } else {
      linhas.push(actual);
      actual = p;
      if (linhas.length === 2) break; // o resto abrevia na 3a linha
    }
  }
  if (actual && linhas.length < 3) linhas.push(actual);
  if (linhas.length === 3 && palavras.length > 3) {
    const usadas = linhas.join(" ").split(" ").length;
    if (usadas < palavras.length) linhas[2] = `${linhas[2]}...`;
  }
  return linhas.slice(0, 3);
}

/** Nome por extenso por baixo do titular, com quebra honesta. */
function desenharNome(
  ctx: CanvasRenderingContext2D,
  op: OpcoesDesenho,
  y: number,
  tamanho: number,
  cor: string,
  larguraMax: number
): number {
  let tamanhoActual = tamanho;
  // A FONTE vem ANTES da medida: medir com a fonte anterior subestimava
  // as linhas e o nome saia cortado nos dois lados do cartaz.
  ctx.font = `bold ${tamanhoActual}px system-ui, sans-serif`;
  let linhas = partirNome(ctx, op.nome, larguraMax);
  // nome comprido demais para 3 linhas: encolhe ate caber
  while (linhas.length === 3 && tamanhoActual > tamanho * 0.7) {
    tamanhoActual = Math.round(tamanhoActual * 0.9);
    ctx.font = `bold ${tamanhoActual}px system-ui, sans-serif`;
    linhas = partirNome(ctx, op.nome, larguraMax);
  }
  ctx.fillStyle = cor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const entrelinha = tamanhoActual * 1.14;
  for (let i = 0; i < linhas.length; i++) {
    ctx.fillText(linhas[i], L / 2, y + i * entrelinha);
  }
  return y + (linhas.length - 1) * entrelinha;
}

/** Pílula arredondada com o centro no x (usada nos "faz X anos"). */
function desenharPastilha(
  ctx: CanvasRenderingContext2D,
  texto: string,
  cx: number,
  cy: number,
  tamanhoFonte: number,
  fundo: string,
  cor: string
) {
  ctx.save();
  ctx.font = `bold ${tamanhoFonte}px system-ui, sans-serif`;
  const w = ctx.measureText(texto).width + tamanhoFonte * 1.6;
  const h = tamanhoFonte * 1.9;
  const r = h / 2;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r);
  ctx.fillStyle = fundo;
  ctx.fill();
  ctx.fillStyle = cor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, cx, cy + tamanhoFonte * 0.05);
  ctx.restore();
}

function desenharFestivo(ctx: CanvasRenderingContext2D, op: OpcoesDesenho) {
  const fundo = ctx.createLinearGradient(0, 0, 0, L);
  fundo.addColorStop(0, "#ffc95c");
  fundo.addColorStop(0.55, "#ff9d4d");
  fundo.addColorStop(1, "#f4694b");
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, L, L);

  // confetti deterministico (o mesmo nome festa sempre igual)
  const rnd = aleatorioSemente(sementeDe(op.nome) + (op.ocasiao === "aniversario" ? 11 : 23));
  const cores = ["#ffffff", "#ffe08a", "#2dd4bf", "#ef4444", "#a78bfa"];
  for (let i = 0; i < 90; i++) {
    const x = rnd() * L;
    const y = rnd() * L;
    const r = 3 + rnd() * 7;
    ctx.globalAlpha = 0.35 + rnd() * 0.4;
    ctx.fillStyle = cores[Math.floor(rnd() * cores.length)];
    if (rnd() > 0.5) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd() * Math.PI);
      ctx.fillRect(-r, -r / 2.2, r * 2, r / 1.1);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  const aniv = op.ocasiao === "aniversario";
  // baloes so no aniversario; estrelas nos anos de casa
  ctx.globalAlpha = 0.9;
  if (aniv) {
    const baloes: [number, number, string][] = [
      [120, 240, "#ef4444"],
      [952, 210, "#2dd4bf"],
      [90, 700, "#a78bfa"],
      [975, 660, "#ffe08a"]
    ];
    for (const [bx, by, cor] of baloes) {
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.ellipse(bx, by, 44, 56, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff88";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx, by + 56);
      ctx.quadraticCurveTo(bx + 14, by + 96, bx, by + 130);
      ctx.stroke();
    }
  }

  desenharAvatar(ctx, op, L / 2, 300, 148, "#ffffff", 10);
  ctx.save();
  ctx.shadowColor = "#00000033";
  ctx.shadowBlur = 24;
  desenharPastilha(
    ctx,
    titularCartaz(op.ocasiao).toUpperCase(),
    L / 2,
    540,
    44,
    "#ffffff",
    "#c2410c"
  );
  ctx.restore();
  const fimNome = desenharNome(ctx, op, 700, 76, "#5b1a05", 820);
  desenharPastilha(ctx, linhaAnos(op.ocasiao, op.anos), L / 2, fimNome + 116, 46, "#5b1a05", "#ffe9c7");

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `${dataLongaCartaz(op.dataISO)}  ·  ${rodapeCartaz(op.empresa)}`,
    L / 2,
    L - 70
  );
}

function desenharElegante(ctx: CanvasRenderingContext2D, op: OpcoesDesenho) {
  const fundo = ctx.createLinearGradient(0, 0, 0, L);
  fundo.addColorStop(0, "#0b1b33");
  fundo.addColorStop(1, "#173257");
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, L, L);

  // estrelas discretas
  const rnd = aleatorioSemente(sementeDe(op.nome) + 5);
  ctx.fillStyle = "#c9a227";
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.08 + rnd() * 0.25;
    ctx.beginPath();
    ctx.arc(rnd() * L, rnd() * L, 1 + rnd() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // moldura fina dourada
  ctx.strokeStyle = "#c9a22799";
  ctx.lineWidth = 3;
  ctx.strokeRect(44, 44, L - 88, L - 88);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 6;
  const c = 44;
  const m = 34;
  ctx.beginPath();
  ctx.moveTo(m, c + 60);
  ctx.lineTo(m, m);
  ctx.lineTo(c + 60, m);
  ctx.moveTo(L - c - 60, m);
  ctx.lineTo(L - m, m);
  ctx.lineTo(L - m, c + 60);
  ctx.moveTo(L - m, L - c - 60);
  ctx.lineTo(L - m, L - m);
  ctx.lineTo(L - c - 60, L - m);
  ctx.moveTo(c + 60, L - m);
  ctx.lineTo(m, L - m);
  ctx.lineTo(m, L - c - 60);
  ctx.stroke();

  desenharAvatar(ctx, op, L / 2, 310, 150, "#c9a227", 6);

  ctx.fillStyle = "#c9a227";
  ctx.font = "600 52px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.letterSpacing = "10px";
  ctx.fillText(titularCartaz(op.ocasiao).toUpperCase(), L / 2, 560);
  ctx.letterSpacing = "0px";

  const fimNome = desenharNome(ctx, op, 690, 82, "#f5f0e1", 840);

  ctx.fillStyle = "#d9e2f0";
  ctx.font = "500 40px system-ui, sans-serif";
  ctx.fillText(linhaAnos(op.ocasiao, op.anos), L / 2, fimNome + 96);
  ctx.font = "500 30px system-ui, sans-serif";
  ctx.fillStyle = "#9fb2cc";
  ctx.fillText(dataLongaCartaz(op.dataISO), L / 2, fimNome + 150);

  ctx.fillStyle = "#c9a227";
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.letterSpacing = "6px";
  ctx.fillText(rodapeCartaz(op.empresa).toUpperCase(), L / 2, L - 88);
  ctx.letterSpacing = "0px";
}

function desenharDanmo(ctx: CanvasRenderingContext2D, op: OpcoesDesenho) {
  ctx.fillStyle = "#f2f7f2";
  ctx.fillRect(0, 0, L, L);

  // banda verde com onda
  ctx.fillStyle = "#16794c";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(L, 0);
  ctx.lineTo(L, 250);
  ctx.quadraticCurveTo(L * 0.72, 330, L * 0.5, 275);
  ctx.quadraticCurveTo(L * 0.25, 220, 0, 300);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1e9c63";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(L, 0);
  ctx.lineTo(L, 170);
  ctx.quadraticCurveTo(L * 0.6, 245, L * 0.3, 190);
  ctx.quadraticCurveTo(L * 0.14, 160, 0, 205);
  ctx.closePath();
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;

  // marca no topo esquerdo
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(rodapeCartaz(op.empresa).toUpperCase(), 70, 110);

  desenharAvatar(ctx, op, L / 2, 380, 150, "#ffffff", 12);

  const aniv = op.ocasiao === "aniversario";
  ctx.textAlign = "center";
  ctx.fillStyle = aniv ? "#c2410c" : "#16794c";
  ctx.font = "bold 54px system-ui, sans-serif";
  ctx.fillText(titularCartaz(op.ocasiao), L / 2, 625);

  const fimNome = desenharNome(ctx, op, 740, 70, "#1c3a2a", 840);

  // numero grande + legenda
  ctx.fillStyle = aniv ? "#ea580c" : "#16794c";
  ctx.font = "bold 132px system-ui, sans-serif";
  ctx.fillText(String(op.anos), L / 2, fimNome + 160);
  ctx.font = "bold 42px system-ui, sans-serif";
  ctx.fillStyle = "#4b6357";
  ctx.fillText(linhaAnos(op.ocasiao, op.anos).replace(/^\d+\s?/, ""), L / 2, fimNome + 216);

  // barra do rodape
  ctx.fillStyle = "#16794c";
  ctx.fillRect(0, L - 92, L, 92);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 32px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(dataLongaCartaz(op.dataISO), 70, L - 52);
  ctx.textAlign = "right";
  ctx.fillText("EQUIPA DANMO", L - 70, L - 52);
}

/** Desenha o cartaz completo num canvas 1080x1080. */
export function desenharCartaz(
  canvas: HTMLCanvasElement,
  op: OpcoesDesenho
): void {
  canvas.width = L;
  canvas.height = L;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (op.modelo === "festivo") desenharFestivo(ctx, op);
  else if (op.modelo === "elegante") desenharElegante(ctx, op);
  else desenharDanmo(ctx, op);
}
