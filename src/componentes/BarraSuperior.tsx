import { Download, Moon, Settings, Sun, Upload } from "lucide-react";

import type { TemaVisual } from "../tipos/altimetria";

interface PropriedadesBarraSuperior {
  tema: TemaVisual;
  aoImportarArquivo: () => void;
  aoExportarRelatorio: () => void;
  aoAlternarTema: () => void;
  aoAbrirConfiguracoes: () => void;
}

export function BarraSuperior({
  tema,
  aoImportarArquivo,
  aoExportarRelatorio,
  aoAlternarTema,
  aoAbrirConfiguracoes
}: PropriedadesBarraSuperior) {
  return (
    <header className="barra-superior">
      <div className="marca">
        <div className="marca-simbolo">AA</div>
        <div>
          <strong>AgroAltimetria Pro</strong>
          <span>Topografia, irrigação e engenharia rural</span>
        </div>
      </div>

      <div className="acoes-topo">
        <button className="botao-icone" type="button" onClick={aoImportarArquivo} title="Importar arquivo">
          <Upload size={18} aria-hidden="true" />
          <span>Importar</span>
        </button>
        <button className="botao-icone" type="button" onClick={aoExportarRelatorio} title="Exportar relatório">
          <Download size={18} aria-hidden="true" />
          <span>Relatório</span>
        </button>
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
