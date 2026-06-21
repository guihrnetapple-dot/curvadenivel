export function CarregamentoInicial() {
  return (
    <div className="carregamento-inicial" role="status" aria-live="polite">
      <div className="carregamento-painel">
        <div className="linha-carregamento" />
        <strong>Preparando ambiente altimétrico</strong>
        <span>Validando API, grade RAW e módulos de mapa.</span>
      </div>
    </div>
  );
}
