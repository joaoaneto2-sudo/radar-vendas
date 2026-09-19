// Catálogo de varejo da Bia Belutti (planilha catalogo-fernanda-brilhante.xlsx, coluna "Preço Varejo").
// O número que vem no fim do nome de cada foto é o preço de atacado e é IGNORADO: o nome da peça
// e o preço de varejo vêm da planilha. Usado só pela tela de importação (/importar-catalogo).

export const FABRICANTE_DO_CATALOGO = "Bia Belutti";

export interface ItemDoCatalogo {
  arquivo: string; // nome exato do arquivo da foto
  nome: string; // descrição da peça, sem o número
  preco: number; // preço de varejo
  categoria: string;
  subtipo: string;
}

export const CATALOGO_BIA_BELUTTI: ItemDoCatalogo[] = [
  { arquivo: "Colar longo duas voltas 157.jpeg", nome: "Colar longo duas voltas", preco: 392.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Canutilho longo ouro e prata 135.jpeg", nome: "Canutilho longo ouro e prata", preco: 337.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Anel Flores 109.jpeg", nome: "Anel Flores", preco: 272.5, categoria: "Anéis", subtipo: "Outro" },
  { arquivo: "Choker com cristal cada 65.jpeg", nome: "Choker com cristal cada", preco: 162.5, categoria: "Colares e Correntes", subtipo: "Choker" },
  { arquivo: "Colar longo 2 voltas canutilho e cristais 157.jpeg", nome: "Colar longo 2 voltas canutilho e cristais", preco: 392.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Anel em cristal bruto Carla Amorim 129.jpeg", nome: "Anel em cristal bruto Carla Amorim", preco: 322.5, categoria: "Anéis", subtipo: "Outro" },
  { arquivo: "Anel em cristal bruto Carla Amorim outras cores 129.jpeg", nome: "Anel em cristal bruto Carla Amorim outras cores", preco: 322.5, categoria: "Anéis", subtipo: "Outro" },
  { arquivo: "Canutilho fino longo por 135.jpeg", nome: "Canutilho fino longo", preco: 337.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Canutilho pequenos choker 75.jpeg", nome: "Canutilho pequenos choker", preco: 187.5, categoria: "Colares e Correntes", subtipo: "Choker" },
  { arquivo: "Colar com pérola barroca legítima e cruz em madre pérolas 55.jpeg", nome: "Colar com pérola barroca legítima e cruz em madre pérolas", preco: 137.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Colar longo canutilho médio 135.jpeg", nome: "Colar longo canutilho médio", preco: 337.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Colar curto em canutilhos grossos e fosco 135.jpeg", nome: "Colar curto em canutilhos grossos e fosco", preco: 337.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Colar curto em mini canutilhos com pérola barroca legítima 77.jpeg", nome: "Colar curto em mini canutilhos com pérola barroca legítima", preco: 192.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Colar em micros canutilhos com pingente em madre pérola e Espírito Santo 85.jpeg", nome: "Colar em micros canutilhos com pingente em madre pérola e Espírito Santo", preco: 212.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Anel 109.jpeg", nome: "Anel", preco: 272.5, categoria: "Anéis", subtipo: "Outro" },
  { arquivo: "Brinco flores 59.jpeg", nome: "Brinco flores", preco: 147.5, categoria: "Brincos", subtipo: "Outro" },
  { arquivo: "Colar com cruz em cristal e zirconias 133.jpeg", nome: "Colar com cruz em cristal e zircônias", preco: 332.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Colar com cruz em cristal e zirconias outras cores 133.jpeg", nome: "Colar com cruz em cristal e zircônias (outras cores)", preco: 332.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Colar com dois fios 135.jpeg", nome: "Colar com dois fios", preco: 337.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Colar curto em Canutilho longo com bolinhas 77.jpeg", nome: "Colar curto em canutilho longo com bolinhas", preco: 192.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Colar Espírito Santo com zircônia 89.jpeg", nome: "Colar Espírito Santo com zircônia", preco: 222.5, categoria: "Colares e Correntes", subtipo: "Outro" },
  { arquivo: "Cruz em cristal 133.jpeg", nome: "Cruz em cristal", preco: 332.5, categoria: "Pingentes", subtipo: "Outro" },
  { arquivo: "Pulseira com pérolas barrocas legítimas 89.jpeg", nome: "Pulseira com pérolas barrocas legítimas", preco: 222.5, categoria: "Pulseiras", subtipo: "Outro" },
  { arquivo: "Pulseira em canutilhos 3 fios 109.jpeg", nome: "Pulseira em canutilhos 3 fios", preco: 272.5, categoria: "Pulseiras", subtipo: "Outro" },
  { arquivo: "Pulseira em canutilhos 3 fios com berloque de ursinho todo cravejado em zircônias 109.jpeg", nome: "Pulseira em canutilhos 3 fios com berloque de ursinho cravejado em zircônias", preco: 272.5, categoria: "Pulseiras", subtipo: "Outro" },
  { arquivo: "Pulseira em cristal 63.jpeg", nome: "Pulseira em cristal", preco: 157.5, categoria: "Pulseiras", subtipo: "Outro" },
  { arquivo: "Pulseiras em canutilho 3 fios 109.jpeg", nome: "Pulseiras em canutilho 3 fios", preco: 272.5, categoria: "Pulseiras", subtipo: "Outro" },
  { arquivo: "Pulseiras riviera 89.jpeg", nome: "Pulseiras riviera", preco: 222.5, categoria: "Pulseiras", subtipo: "Riviera" },
  { arquivo: "Brinco 2 em 1 , inspiração Virgínia no ouro com zircônia italiana por 36.jpeg", nome: "Brinco 2 em 1, inspiração Virgínia no ouro com zircônia italiana", preco: 90, categoria: "Brincos", subtipo: "Outro" },
];

/** Chave para casar o nome do arquivo escolhido com o do catálogo (sem diferença de acento ou maiúscula). */
export function chaveDoArquivo(nome: string): string {
  return nome.normalize("NFC").toLowerCase().trim();
}
