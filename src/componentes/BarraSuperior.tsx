import logoCurvaNivel from "../assets/logo-curva-nivel.png";

interface BarraSuperiorProps {
  nomeUsuario?: string;
  usuarioEmail?: string;
  aoSair?: () => void;
}

export function BarraSuperior({ nomeUsuario, usuarioEmail, aoSair }: BarraSuperiorProps) {
  return (
    <header className="barra-superior">
      <div className="marca">
        <div className="marca-simbolo">
          <img src={logoCurvaNivel} alt="Logo Curva de Nível" />
        </div>
        <div>
          <strong>Curva de Nível</strong>
          <span>Topografia, irrigação e Engenharia.</span>
        </div>
      </div>
      {aoSair && (
        <div className="usuario-topo">
          <span>{nomeUsuario || usuarioEmail}</span>
          <button type="button" className="botao-logout" onClick={aoSair}>
            Sair
          </button>
        </div>
      )}
    </header>
  );
}
