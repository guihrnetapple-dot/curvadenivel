import { Settings } from "lucide-react";

import logoCurvaNivel from "../assets/logo-curva-nivel.png";

interface PropriedadesBarraSuperior {
  aoAbrirConfiguracoes: () => void;
}

export function BarraSuperior({ aoAbrirConfiguracoes }: PropriedadesBarraSuperior) {
  return (
    <header className="barra-superior">
      <div className="marca">
        <div className="marca-simbolo">
          <img src={logoCurvaNivel} alt="Logo Curva de Nível" />
        </div>
        <div>
          <strong>Curva de Nível</strong>
          <span>Topografia, irrigação e engenharia rural</span>
        </div>
      </div>

      <div className="acoes-topo">
        <button className="botao-quadrado" type="button" onClick={aoAbrirConfiguracoes} title="Configurações">
          <Settings size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
