import { Moon, Settings, Sun } from "lucide-react";

import logoCurvaNivel from "../assets/logo-curva-nivel.png";
import type { FonteElevacao, TemaVisual } from "../tipos/altimetria";

interface PropriedadesBarraSuperior {
  tema: TemaVisual;
  fonteElevacao: FonteElevacao;
  aoAlternarTema: () => void;
  aoAbrirConfiguracoes: () => void;
  aoAlterarFonteElevacao: (fonte: FonteElevacao) => void;
}

export function BarraSuperior({
  tema,
  fonteElevacao,
  aoAlternarTema,
  aoAbrirConfiguracoes,
  aoAlterarFonteElevacao
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
        <label className="seletor-fonte-elevacao">
          <span>Cálculo de elevação</span>
          <select
            value={fonteElevacao}
            onChange={(evento) => aoAlterarFonteElevacao(evento.target.value as FonteElevacao)}
            title="Método para calcular elevação, pontos e curvas de nível"
          >
            <option value="raw">Interpolação RAW</option>
            <option value="open_elevation">API Open-Elevation</option>
          </select>
        </label>
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
