import { useCallback, useEffect, useRef, useState } from "react";

import { BarraSuperior } from "./componentes/BarraSuperior";
import { CarregamentoInicial } from "./componentes/CarregamentoInicial";
import { GraficoPerfil } from "./componentes/GraficoPerfil";
import { MapaAltimetria } from "./componentes/MapaAltimetria";
import { PainelDireito } from "./componentes/PainelDireito";
import { consultarAltitude, consultarPerfilElevacao, consultarStatusApi } from "./servicos/apiAltimetria";
import type {
  AlertaSistema,
  CamadaBase,
  CamadaImportada,
  CamadasVisiveis,
  ElementoMapa,
  PerfilElevacao,
  PontoPerfil,
  ResultadoAltitude,
  StatusApi,
  TemaVisual
} from "./tipos/altimetria";
import {
  exportarDesenhosGeoJson,
  exportarDesenhosKml,
  exportarPerfilCsv,
  exportarRelatorioHtml
} from "./utilitarios/exportacao";
import { importarArquivoGeografico } from "./utilitarios/importacaoGeografica";

const CHAVE_HISTORICO = "agroaltimetria.historico";
const CHAVE_TEMA = "agroaltimetria.tema";

const camadasIniciais: CamadasVisiveis = {
  relevo: false,
  gradeAltitude: true,
  importados: true,
  desenhos: true
};

function lerLocalStorage<T>(chave: string, fallback: T): T {
  try {
    const conteudo = localStorage.getItem(chave);
    return conteudo ? (JSON.parse(conteudo) as T) : fallback;
  } catch {
    return fallback;
  }
}

function extrairCoordenadas(texto: string): { latitude: number; longitude: number } {
  const numeros = texto.match(/[+-]?\d+(?:[.,]\d+)?/g) ?? [];
  if (numeros.length < 2) {
    throw new Error("Informe latitude e longitude no campo de busca.");
  }

  const latitudeTexto = numeros[0];
  const longitudeTexto = numeros[1];
  if (!latitudeTexto || !longitudeTexto) {
    throw new Error("Informe latitude e longitude no campo de busca.");
  }

  return {
    latitude: Number(latitudeTexto.replace(",", ".")),
    longitude: Number(longitudeTexto.replace(",", "."))
  };
}

export function Aplicacao() {
  const inputArquivoRef = useRef<HTMLInputElement | null>(null);
  const [tema, setTema] = useState<TemaVisual>(() => {
    const temaSalvo = localStorage.getItem(CHAVE_TEMA);
    return temaSalvo === "escuro" ? "escuro" : "claro";
  });
  const [statusApi, setStatusApi] = useState<StatusApi>({
    carregando: true,
    backendOnline: false,
    arquivoCarregado: false
  });
  const [inicializando, setInicializando] = useState(true);
  const [camadaBase, setCamadaBase] = useState<CamadaBase>("mapa");
  const [camadasVisiveis, setCamadasVisiveis] = useState<CamadasVisiveis>(camadasIniciais);
  const [historico, setHistorico] = useState<ResultadoAltitude[]>(() =>
    lerLocalStorage<ResultadoAltitude[]>(CHAVE_HISTORICO, [])
  );
  const [resultadoAtual, setResultadoAtual] = useState<ResultadoAltitude | null>(historico[0] ?? null);
  const [elementos, setElementos] = useState<ElementoMapa[]>([]);
  const [elementoSelecionadoId, setElementoSelecionadoId] = useState<string | null>(null);
  const [camadasImportadas, setCamadasImportadas] = useState<CamadaImportada[]>([]);
  const [perfil, setPerfil] = useState<PerfilElevacao | null>(null);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);
  const [pontoDestacado, setPontoDestacado] = useState<PontoPerfil | null>(null);
  const [alerta, setAlerta] = useState<AlertaSistema | null>(null);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    localStorage.setItem(CHAVE_TEMA, tema);
  }, [tema]);

  useEffect(() => {
    localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(historico.slice(0, 80)));
  }, [historico]);

  const verificarStatus = useCallback(async () => {
    try {
      const status = await consultarStatusApi();
      setStatusApi(status);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Backend offline.";
      setStatusApi({
        carregando: false,
        backendOnline: false,
        arquivoCarregado: false,
        erro: mensagem
      });
    }
  }, []);

  useEffect(() => {
    verificarStatus().finally(() => setInicializando(false));
    const intervalo = window.setInterval(verificarStatus, 12000);
    return () => window.clearInterval(intervalo);
  }, [verificarStatus]);

  useEffect(() => {
    if (!alerta) {
      return;
    }
    const temporizador = window.setTimeout(() => setAlerta(null), 5200);
    return () => window.clearTimeout(temporizador);
  }, [alerta]);

  const registrarResultado = useCallback((resultado: ResultadoAltitude) => {
    setResultadoAtual(resultado);
    setHistorico((itens) => [resultado, ...itens].slice(0, 80));
  }, []);

  const consultarCoordenada = useCallback(
    async (latitude: number, longitude: number): Promise<ResultadoAltitude | null> => {
      try {
        const resultado = await consultarAltitude(latitude, longitude);
        registrarResultado(resultado);
        setAlerta({
          tipo: resultado.status === "valido" ? "sucesso" : "aviso",
          mensagem: resultado.mensagem
        });
        return resultado;
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : "Não foi possível consultar a altitude.";
        setAlerta({ tipo: "erro", mensagem });
        return null;
      }
    },
    [registrarResultado]
  );

  function buscarTextoCoordenada(texto: string) {
    try {
      const coordenada = extrairCoordenadas(texto);
      consultarCoordenada(coordenada.latitude, coordenada.longitude);
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Coordenada inválida."
      });
    }
  }

  function alternarCamada(camada: keyof CamadasVisiveis) {
    setCamadasVisiveis((estado) => ({
      ...estado,
      [camada]: !estado[camada]
    }));
  }

  function adicionarElemento(elemento: ElementoMapa) {
    setElementos((itens) => [elemento, ...itens]);
  }

  function atualizarElemento(elementoAtualizado: ElementoMapa) {
    setElementos((itens) =>
      itens.map((item) =>
        item.id === elementoAtualizado.id
          ? {
              ...item,
              tipo: elementoAtualizado.tipo,
              geometria: elementoAtualizado.geometria
            }
          : item
      )
    );
  }

  function removerElemento(id: string) {
    setElementos((itens) => itens.filter((item) => item.id !== id));
    if (elementoSelecionadoId === id) {
      setElementoSelecionadoId(null);
      setPerfil(null);
    }
  }

  async function importarArquivos(arquivos: FileList | null) {
    if (!arquivos?.length) {
      return;
    }

    try {
      const importadas = await Promise.all(Array.from(arquivos).map(importarArquivoGeografico));
      setCamadasImportadas((itens) => [...importadas, ...itens]);
      setAlerta({
        tipo: "sucesso",
        mensagem: `${importadas.length} camada(s) importada(s) com sucesso.`
      });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Falha ao importar arquivo geográfico."
      });
    } finally {
      if (inputArquivoRef.current) {
        inputArquivoRef.current.value = "";
      }
    }
  }

  function alternarCamadaImportada(id: string) {
    setCamadasImportadas((itens) =>
      itens.map((item) => (item.id === id ? { ...item, ativa: !item.ativa } : item))
    );
  }

  async function analisarPerfil() {
    const elemento = elementos.find((item) => item.id === elementoSelecionadoId);
    if (!elemento) {
      setAlerta({ tipo: "aviso", mensagem: "Selecione um elemento desenhado para analisar." });
      return;
    }

    setCarregandoPerfil(true);
    setPontoDestacado(null);
    try {
      const resultado = await consultarPerfilElevacao(elemento.geometria);
      setPerfil(resultado);
      setAlerta({ tipo: "sucesso", mensagem: "Perfil de elevação calculado pelo backend." });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível calcular o perfil."
      });
    } finally {
      setCarregandoPerfil(false);
    }
  }

  function executarExportacao(acao: () => void) {
    try {
      acao();
      setAlerta({ tipo: "sucesso", mensagem: "Exportação iniciada." });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível exportar."
      });
    }
  }

  return (
    <div className="aplicacao">
      {inicializando && <CarregamentoInicial />}

      <BarraSuperior
        statusApi={statusApi}
        tema={tema}
        aoBuscarCoordenada={buscarTextoCoordenada}
        aoImportarArquivo={() => inputArquivoRef.current?.click()}
        aoExportarRelatorio={() => executarExportacao(() => exportarRelatorioHtml(perfil))}
        aoAlternarTema={() => setTema((valor) => (valor === "claro" ? "escuro" : "claro"))}
        aoAbrirConfiguracoes={() =>
          setAlerta({
            tipo: "aviso",
            mensagem: "Configurações técnicas preservadas: cálculo no backend e RAW carregado uma única vez."
          })
        }
      />

      <main className="area-trabalho">
        <div className="coluna-mapa">
          <MapaAltimetria
            tema={tema}
            camadaBase={camadaBase}
            camadasVisiveis={camadasVisiveis}
            camadasImportadas={camadasImportadas}
            pontoDestacado={pontoDestacado}
            aoConsultarCoordenada={consultarCoordenada}
            aoElementoCriado={adicionarElemento}
            aoElementoAtualizado={atualizarElemento}
            aoElementoRemovido={removerElemento}
            aoSelecionarElemento={setElementoSelecionadoId}
          />
          <GraficoPerfil
            perfil={perfil}
            carregando={carregandoPerfil}
            aoSelecionarPonto={(ponto) => setPontoDestacado(ponto)}
          />
        </div>

        <PainelDireito
          camadaBase={camadaBase}
          camadasVisiveis={camadasVisiveis}
          resultadoAtual={resultadoAtual}
          historico={historico}
          elementos={elementos}
          elementoSelecionadoId={elementoSelecionadoId}
          perfil={perfil}
          carregandoPerfil={carregandoPerfil}
          camadasImportadas={camadasImportadas}
          aoAlterarCamadaBase={setCamadaBase}
          aoAlternarCamada={alternarCamada}
          aoConsultarManual={(latitude, longitude) => consultarCoordenada(latitude, longitude)}
          aoSelecionarElemento={(id) => setElementoSelecionadoId(id || null)}
          aoAnalisarPerfil={analisarPerfil}
          aoLimparAnalise={() => {
            setPerfil(null);
            setPontoDestacado(null);
          }}
          aoImportarArquivo={() => inputArquivoRef.current?.click()}
          aoAlternarCamadaImportada={alternarCamadaImportada}
          aoExportarRelatorio={() => executarExportacao(() => exportarRelatorioHtml(perfil))}
          aoExportarCsv={() => executarExportacao(() => exportarPerfilCsv(perfil))}
          aoExportarGeoJson={() => executarExportacao(() => exportarDesenhosGeoJson(elementos, camadasImportadas))}
          aoExportarKml={() => executarExportacao(() => exportarDesenhosKml(elementos))}
        />
      </main>

      <input
        ref={inputArquivoRef}
        className="entrada-arquivo"
        type="file"
        multiple
        accept=".kml,.kmz,.geojson,.json"
        onChange={(evento) => importarArquivos(evento.target.files)}
      />

      {alerta && <div className={`alerta-sistema ${alerta.tipo}`}>{alerta.mensagem}</div>}
    </div>
  );
}
