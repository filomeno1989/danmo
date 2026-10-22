/**
 * comprimir-foto.ts - Foto de ficha comprimida no NAVEGADOR.
 *
 * Mesma receita provada no gestor de fundos do login: tentativas
 * progressivas (do melhor para o mais leve) até a foto caber no limite
 * que o servidor aceita, fundo branco no canvas (PNG transparente não
 * fica preto ao virar JPEG) e fallback para navegadores sem
 * createImageBitmap. Copiado a proposito: o gestor de fundos acabou de
 * ser testado com o Filomeno e nao se toca nele; quando as duas partes
 * estiverem rodadas juntas, pode-se unificar aqui.
 */

const LIMITE_FOTO = 690_000;

const TENTATIVAS = [
  { lado: 1920, qualidade: 0.8 },
  { lado: 1600, qualidade: 0.7 },
  { lado: 1280, qualidade: 0.6 },
  { lado: 1024, qualidade: 0.5 },
  { lado: 820, qualidade: 0.45 }
];

type FonteImagem = {
  desenho: CanvasImageSource;
  largura: number;
  altura: number;
  limpar: () => void;
};

async function carregarImagem(ficheiro: File): Promise<FonteImagem> {
  try {
    const bitmap = await createImageBitmap(ficheiro);
    return {
      desenho: bitmap,
      largura: bitmap.width,
      altura: bitmap.height,
      limpar: () => bitmap.close()
    };
  } catch {
    const url = URL.createObjectURL(ficheiro);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => {
        URL.revokeObjectURL(url);
        rej(new Error("O navegador não conseguiu ler a imagem."));
      };
      i.src = url;
    });
    return {
      desenho: img,
      largura: img.naturalWidth,
      altura: img.naturalHeight,
      limpar: () => URL.revokeObjectURL(url)
    };
  }
}

/** Comprime no navegador (JPEG com fundo branco) e devolve o data URL. */
export async function comprimirFoto(ficheiro: File): Promise<string> {
  if (!ficheiro.type.startsWith("image/")) {
    throw new Error("Escolhe um ficheiro de imagem (JPG, PNG, WebP).");
  }
  const fonte = await carregarImagem(ficheiro);
  try {
    let ultimo = "";
    for (const t of TENTATIVAS) {
      const escala = Math.min(1, t.lado / Math.max(fonte.largura, fonte.altura));
      const tela = document.createElement("canvas");
      tela.width = Math.max(1, Math.round(fonte.largura * escala));
      tela.height = Math.max(1, Math.round(fonte.altura * escala));
      const ctx = tela.getContext("2d");
      if (!ctx) throw new Error("O navegador não conseguiu processar a imagem.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, tela.width, tela.height);
      ctx.drawImage(fonte.desenho, 0, 0, tela.width, tela.height);
      ultimo = tela.toDataURL("image/jpeg", t.qualidade);
      if (ultimo.length <= LIMITE_FOTO) return ultimo;
    }
    return ultimo;
  } finally {
    fonte.limpar();
  }
}

/**
 * MINI da foto para a grelha do Quadro: recorte quadrado do centro com
 * viés para cima (a cara costuma ficar no terco superior) e lado fixo
 * de 240px, JPEG leve. Nasce junto da foto grande no momento do upload
 * e vive na mesma linha da tabela de fotos; e a MINI que a lista do
 * Quadro carrega, para a grelha nunca pesar o que a ficha pesa.
 */
const MINI_LADO = 240;
const MINI_QUALIDADE = 0.72;

export async function comprimirMiniFoto(ficheiro: File): Promise<string> {
  if (!ficheiro.type.startsWith("image/")) {
    throw new Error("Escolhe um ficheiro de imagem (JPG, PNG, WebP).");
  }
  const fonte = await carregarImagem(ficheiro);
  try {
    const ladoFonte = Math.min(fonte.largura, fonte.altura);
    const sx = Math.floor((fonte.largura - ladoFonte) / 2);
    const sy = Math.floor((fonte.altura - ladoFonte) * 0.25);
    const tela = document.createElement("canvas");
    tela.width = MINI_LADO;
    tela.height = MINI_LADO;
    const ctx = tela.getContext("2d");
    if (!ctx) throw new Error("O navegador não conseguiu processar a imagem.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, MINI_LADO, MINI_LADO);
    ctx.drawImage(fonte.desenho, sx, sy, ladoFonte, ladoFonte, 0, 0, MINI_LADO, MINI_LADO);
    return tela.toDataURL("image/jpeg", MINI_QUALIDADE);
  } finally {
    fonte.limpar();
  }
}
