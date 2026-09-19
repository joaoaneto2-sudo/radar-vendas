"use client";

import { useEffect } from "react";

// No celular, as tabelas viram cartões (uma informação por linha). Para cada informação aparecer
// com o seu título, copiamos o título da coluna para dentro de cada célula (data-label).
// Serve para todas as tabelas do sistema, inclusive as que aparecem depois de carregar.

export default function ResponsiveTables() {
  useEffect(() => {
    let agendado = 0;

    function anotar() {
      document.querySelectorAll("table").forEach((tabela) => {
        const titulos = Array.from(tabela.querySelectorAll("thead th")).map((th) => (th.textContent ?? "").trim());
        tabela.querySelectorAll("tbody tr").forEach((linha) => {
          Array.from(linha.children).forEach((celula, i) => {
            const titulo = titulos[i] ?? "";
            if (celula.getAttribute("data-label") !== titulo) celula.setAttribute("data-label", titulo);
            // Célula vazia (só "-"): no celular some, para o cartão não ficar comprido à toa.
            const vazia = celula.children.length === 0 && ["", "-"].includes((celula.textContent ?? "").trim());
            if (vazia) celula.setAttribute("data-vazio", "1");
            else celula.removeAttribute("data-vazio");
          });
        });
      });
    }

    function agendar() {
      cancelAnimationFrame(agendado);
      agendado = requestAnimationFrame(anotar);
    }

    anotar();
    const observador = new MutationObserver(agendar); // só olha entrada e saída de elementos, não atributos
    observador.observe(document.body, { childList: true, subtree: true });
    return () => {
      observador.disconnect();
      cancelAnimationFrame(agendado);
    };
  }, []);

  return null;
}
