import {
  Database,
  Download,
  Moon,
  Search,
  Settings,
  Sun,
  Upload,
  Wifi
} from "lucide-react";
import { FormEvent, useState } from "react";

import type { StatusApi, TemaVisual } from "../tipos/altimetria";

interface PropriedadesBarraSuperior {
  statusApi: StatusApi;
  tema: TemaVisual;
  aoBuscarCoordenada: (texto: string) => void;
  aoImportarArquivo: () => void;
  aoExportarRelatorio: () => void;
  aoAlternarTema: () => void;
  aoAbrirConfiguracoes: () => void;
}

export function BarraSuperior({
  statusApi,
  tema,
  aoBuscarCoordenada,
  aoImportarArquivo,
  aoExportarRelatorio,
  aoAlternarTema,
  aoAbrirConfiguracoes
}: PropriedadesBarraSuperior) {
  const [textoBusca, setTextoBusca] = useState("-16.72, -43.86");

  function enviarBusca(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    aoBuscarCoordenada(textoBusca);
  }

  const statusBackend = statusApi.backendOnline ? "Online" : "Offline";
  const statusArquivo = statusApi.arquivoCarregado ? "RAW carregado" : "RAW pendente";

  return (
    <header className="barra-superior">
      <div className="marca">
        <div className="marca-simbolo">AA</div>
        <div>
          <strong>AgroAltimetria Pro</strong>
          <span>Topografia, irrigação e engenharia rural</span>
        </div>
      </div>

      <form className="busca-coordenada" onSubmit={enviarBusca}>
        <label htmlFor="busca-coordenada">Coordenada</label>
        <div className="campo-busca">
          <Search size={17} aria-hidden="true" />
          <input
            id="busca-coordenada"
            value={textoBusca}
            onChange={(evento) => setTextoBusca(evento.target.value)}
            placeholder="latitude, longitude"
            autoComplete="off"
          />
          <button type="submit">Consultar</button>
        </div>
      </form>

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

      <div className="status-topo">
        <span className={statusApi.backendOnline ? "status-pill sucesso" : "status-pill erro"}>
          <Wifi size={14} aria-hidden="true" />
          {statusBackend}
        </span>
        <span className={statusApi.arquivoCarregado ? "status-pill sucesso" : "status-pill aviso"}>
          <Database size={14} aria-hidden="true" />
          {statusArquivo}
        </span>
      </div>
    </header>
  );
}
