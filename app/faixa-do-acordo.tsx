import { resumoDoAcordo, type EntradaDoResumo } from "@/lib/acordo-resumo";
import { Progresso } from "./charts";

// O acordo entre João e Fernanda, sempre à vista: a divisão, o estoque inicial e a dívida do João.
// Os números vêm dos Parâmetros do acordo e das contas; nada é digitado aqui.
export default function FaixaDoAcordo({ dados, semLink }: { dados: EntradaDoResumo; semLink?: boolean }) {
  const r = resumoDoAcordo(dados);
  return (
    <section className="acordo-faixa" aria-label="Acordo entre os sócios">
      <header>
        <h2>O acordo entre os sócios</h2>
        {!semLink && <a href="/financeiro/acordo">Ver e ajustar</a>}
      </header>

      <div className="acordo-lados">
        <div className="acordo-lado acordo-lado--joao">
          <span>João</span>
          <strong>{r.joaoPct}</strong>
          <em>{r.divida.quitada ? "Dívida do estoque quitada" : `Ainda deve ${r.divida.falta} do estoque inicial`}</em>
        </div>
        <div className="acordo-lado">
          <span>Fernanda</span>
          <strong>{r.fernandaPct}</strong>
          <em>Pagou o estoque inicial, de {r.estoque.valor}</em>
        </div>
      </div>

      <div className="mini-stats">
        <div>
          <span>Estoque inicial</span>
          <strong>{r.estoque.valor}</strong>
        </div>
        <div>
          <span>{`Dívida do João (${r.parteDoJoao})`}</span>
          <strong>{r.divida.total}</strong>
        </div>
        <div>
          <span>Já pago direto</span>
          <strong>{r.divida.pagoDireto}</strong>
        </div>
        <div>
          <span>Abatido pelas vendas</span>
          <strong>{r.divida.abatido}</strong>
        </div>
      </div>

      <Progresso titulo="Dívida quitada" fracao={r.divida.fracao} detalhe={r.divida.quitada ? "Nada a pagar" : `Faltam ${r.divida.falta} de ${r.divida.total}`} />

      <ul className="acordo-frases">
        {r.frases.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <p className="acordo-nota">{r.estoque.nota}</p>
    </section>
  );
}
