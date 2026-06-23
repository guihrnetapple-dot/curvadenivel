import logoCurvaNivel from "../assets/logo-curva-nivel.png";
import { Settings } from "lucide-react";

interface BarraSuperiorProps {
  nomeUsuario?: string;
  usuarioEmail?: string;
  aoAbrirConfiguracoes?: () => void;
  aoSair?: () => void;
}

export function BarraSuperior({ nomeUsuario, usuarioEmail, aoAbrirConfiguracoes, aoSair }: BarraSuperiorProps) {
  return (
    <header className="barra-superior">
      <div className="marca">
        <div className="marca-simbolo">
          <img src={logoCurvaNivel} alt="Logo GeoCampo" />
        </div>
        <div>
          <strong>GeoCampo</strong>
          <span>Topografia, irrigação e Engenharia.</span>
        </div>
      </div>
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
