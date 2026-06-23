import logoCurvaNivel from "../assets/logo-curva-nivel.png";
import { Settings } from "lucide-react";

interface BarraSuperiorProps {
  nomeUsuario?: string;
  usuarioEmail?: string;
  aoIrInicio?: () => void;
  aoAbrirConfiguracoes?: () => void;
  aoSair?: () => void;
}

export function BarraSuperior({ nomeUsuario, usuarioEmail, aoIrInicio, aoAbrirConfiguracoes, aoSair }: BarraSuperiorProps) {
  return (
    <header className="barra-superior">
      <button type="button" className="marca marca-botao" onClick={aoIrInicio} aria-label="Voltar para a tela inicial">
        <div className="marca-simbolo">
          <img src={logoCurvaNivel} alt="Logo GeoCampo" />
        </div>
        <div>
          <strong>GeoCampo</strong>
          <span>Topografia, irrigação e engenharia.</span>
        </div>
      </button>
      {aoSair && (
        <div className="usuario-topo">
          <span>{nomeUsuario || usuarioEmail}</span>
          {aoAbrirConfiguracoes && (
            <button
              type="button"
              className="botao-icone-topo"
              onClick={aoAbrirConfiguracoes}
              aria-label="Abrir configurações da conta"
              title="Configurações da conta"
            >
              <Settings size={18} />
            </button>
          )}
          <button type="button" className="botao-logout" onClick={aoSair}>
            Sair
          </button>
        </div>
      )}
    </header>
  );
}
