import type { CartaoDeFundo } from "@/lib/faixa-dos-fundos";

// Acumulado, gasto e saldo de cada fundo, sempre à vista no alto do Painel financeiro.
export default function FaixaDosFundos({ cartoes }: { cartoes: CartaoDeFundo[] }) {
  return (
    <section className="fundos-faixa" aria-label="Fundos">
      <header>
        <h2>Fundos</h2>
        <a href="/financeiro/fundos">Ver e ajustar</a>
      </header>
      <div className="fundos-grade">
        {cartoes.map((c) => (
          <a className="fundo-cartao" href={c.href} key={c.chave}>
            <span className="fundo-titulo">{c.titulo}</span>
            <span className="fundo-pct">{c.pct}</span>
            <span className="fundo-linha">
              <em>Acumulado</em>
              <strong>{c.acumulado}</strong>
            </span>
            <span className="fundo-linha">
              <em>Gasto</em>
              <strong>{c.gasto}</strong>
            </span>
            <span className={"fundo-linha fundo-saldo" + (c.saldoNegativo ? " negativo" : "")}>
              <em>Saldo</em>
              <strong>{c.saldo}</strong>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
