import { redirect } from "next/navigation";

// Abrir o Radar vai direto para as vendas (pedido do João, 23/09/2026).
// A Visão geral continua existindo, só que em /visao-geral, e foi para o fim do menu.
export default function Home() {
  redirect("/relatorio");
}
