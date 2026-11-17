import { describe, expect, it } from "vitest";
import { raizDeHandle } from "../../lib/fonte-de-pastas";

// Imita os "handles" da File System Access API: só o que raizDeHandle usa (name, kind, values, getFile).
/* eslint-disable @typescript-eslint/no-explicit-any */
const arquivo = (name: string): any => ({ kind: "file", name, getFile: async () => new File(["x"], name, { lastModified: 1 }) });
const pasta = (name: string, filhos: any[]): any => ({
  kind: "directory",
  name,
  values: async function* () {
    yield* filhos;
  },
});

describe("raizDeHandle", () => {
  it("com a pasta 1 - Estoque Principal, cada subpasta é um fabricante", async () => {
    const raiz = pasta("1 - Estoque Principal", [
      arquivo("relatorio.csv"),
      pasta("Zarpellon", [arquivo("Anel - custo 10,00.jpg")]),
      pasta("Glamour", [arquivo("Brinco - custo 20,00.jpg"), arquivo("notas.txt")]),
      pasta("Zarpellon - para nomear", [arquivo("x.jpg")]),
    ]);
    const dirs = await raizDeHandle(raiz).diretorios();
    expect(dirs.map((d) => d.nome)).toEqual(["Glamour", "Zarpellon"]);
    expect((await dirs[0].arquivos()).map((a) => a.nome)).toEqual(["Brinco - custo 20,00.jpg"]);
  });

  it("com a pasta de um fabricante escolhida direto, lê as fotos dela com o nome dela", async () => {
    const raiz = pasta("Zarpellon", [
      arquivo("Anel - custo 10,00.jpg"),
      arquivo("Anel - modelo.jpg"),
      pasta("Fotos Originais", [arquivo("original.jpg")]),
      pasta("Planilhas", []),
    ]);
    const dirs = await raizDeHandle(raiz).diretorios();
    expect(dirs.map((d) => d.nome)).toEqual(["Zarpellon"]);
    expect((await dirs[0].arquivos()).map((a) => a.nome)).toEqual(["Anel - custo 10,00.jpg", "Anel - modelo.jpg"]);
  });
});
