import { Moon, Settings, Sun } from "lucide-react";

import logoCurvaNivel from "../assets/logo-curva-nivel.png";
import type { TemaVisual } from "../tipos/altimetria";

interface PropriedadesBarraSuperior {
  tema: TemaVisual;
  aoAlternarTema: () => void;
  aoAbrirConfiguracoes: () => void;
}

export function BarraSuperior({
  tema,
  aoAlternarTema,
  aoAbrirConfiguracoes
}: PropriedadesBarraSuperior) {
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
        <button className="botao-quadrado" type="button" onClick={aoAlternarTema} title="Alternar tema">
          {tema === "claro" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
        </button>
        <button className="botao-quadrado" type="button" onClick={aoAbrirConfiguracoes} title="Configurações">
          <Settings size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
