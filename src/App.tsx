import { useCallback, useEffect, useRef, useState } from "react";

import { BarraSuperior } from "./componentes/BarraSuperior";
import { CarregamentoInicial } from "./componentes/CarregamentoInicial";
import { MapaAltimetria } from "./componentes/MapaAltimetria";
import { PainelDireito } from "./componentes/PainelDireito";
import { consultarAltitude, consultarPerfilElevacao, consultarStatusApi } from "./servicos/apiAltimetria";
import { gerarCurvasNivel } from "./servicos/apiCurvasNivel";
import { pesquisarLocalizacao } from "./servicos/apiLocalizacao";
import type {
  AlertaSistema,
  BboxCurvasNivel,
  CamadaBase,
  CamadaImportada,
  CamadasVisiveis,
  CurvasNivelGeoJson,
  ElementoMapa,
  LocalizacaoEncontrada,
  PerfilElevacao,
  PontoPerfil,
  ResultadoAltitude,
  StatusApi,
  TemaVisual
} from "./tipos/altimetria";
import {
  exportarDesenhosGeoJson,
  exportarDesenhosKml,
  exportarElementoGeoJson,
  exportarElementoKml,
  exportarPerfilCsv,
  exportarRelatorioHtml
} from "./utilitarios/exportacao";
import {
  exportarCurvasNivelDxf,
  exportarCurvasNivelKml,
  exportarCurvasNivelKmz
} from "./utilitarios/exportacaoCurvasNivel";
import { importarArquivoGeografico } from "./utilitarios/importacaoGeografica";

const CHAVE_HISTORICO = "agroaltimetria.historico";
const TEMA_PADRAO: TemaVisual = "escuro";
const camadasIniciais: CamadasVisiveis = {
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

export function Aplicacao() {
  const inputArquivoRef = useRef<HTMLInputElement | null>(null);
  const elementosRef = useRef<ElementoMapa[]>([]);
  const historicoElementosRef = useRef<ElementoMapa[][]>([]);
  const refazimentoElementosRef = useRef<ElementoMapa[][]>([]);
  const tema = TEMA_PADRAO;
  const [, setStatusApi] = useState<StatusApi>({
    carregando: true,
    backendOnline: false
  });
  const [inicializando, setInicializando] = useState(true);
  const [camadaBase, setCamadaBase] = useState<CamadaBase>("satelite");
  const camadasVisiveis = camadasIniciais;
  const [historico, setHistorico] = useState<ResultadoAltitude[]>(() =>
    lerLocalStorage<ResultadoAltitude[]>(CHAVE_HISTORICO, [])
  );
  const [resultadoAtual, setResultadoAtual] = useState<ResultadoAltitude | null>(historico[0] ?? null);
  const [elementos, setElementos] = useState<ElementoMapa[]>([]);
  const [elementoSelecionadoId, setElementoSelecionadoId] = useState<string | null>(null);
  const [camadasImportadas, setCamadasImportadas] = useState<CamadaImportada[]>([]);
  const [perfil, setPerfil] = useState<PerfilElevacao | null>(null);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);
  const [curvasNivel, setCurvasNivel] = useState<CurvasNivelGeoJson | null>(null);
  const [visibilidadeCamadaCurvasNivel, setVisibilidadeCamadaCurvasNivel] = useState(true);
  const [carregandoCurvas, setCarregandoCurvas] = useState(false);
  const [, setBoundsMapa] = useState<BboxCurvasNivel | null>(null);
  const [selecionandoAreaCurvas, setSelecionandoAreaCurvas] = useState(false);
  const [selecionandoPontoAltitude, setSelecionandoPontoAltitude] = useState(false);
  const [intervaloCurvasMetros, setIntervaloCurvasMetros] = useState(5);
  const [pontoDestacado, setPontoDestacado] = useState<PontoPerfil | null>(null);
  const [termoLocalizacao, setTermoLocalizacao] = useState("");
  const [carregandoLocalizacao, setCarregandoLocalizacao] = useState(false);
  const [localizacaoFocada, setLocalizacaoFocada] = useState<LocalizacaoEncontrada | null>(null);
  const [rotulosMapaAtivos, setRotulosMapaAtivos] = useState(true);
  const [alerta, setAlerta] = useState<AlertaSistema | null>(null);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
  }, [tema]);

  useEffect(() => {
    localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(historico.slice(0, 80)));
  }, [historico]);

  useEffect(() => {
    elementosRef.current = elementos;
  }, [elementos]);

  const verificarStatus = useCallback(async () => {
    try {
      const status = await consultarStatusApi();
      setStatusApi(status);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Backend offline.";
      setStatusApi({
        carregando: false,
        backendOnline: false,
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

  function iniciarAnalisePonto() {
    setSelecionandoPontoAltitude(true);
    setSelecionandoAreaCurvas(false);
  }

  async function analisarPontoNoMapa(latitude: number, longitude: number) {
    setSelecionandoPontoAltitude(false);
    await consultarCoordenada(latitude, longitude);
  }

  function alterarElementosComHistorico(obterProximoEstado: (itens: ElementoMapa[]) => ElementoMapa[]) {
    setElementos((itens) => {
      const proximoEstado = obterProximoEstado(itens);
      historicoElementosRef.current = [...historicoElementosRef.current.slice(-79), itens];
      refazimentoElementosRef.current = [];
      return proximoEstado;
    });
  }

  function limparSelecaoElemento() {
    setElementoSelecionadoId(null);
  }

  function desfazerElementos() {
    const estadoAnterior = historicoElementosRef.current.at(-1);
    if (!estadoAnterior) {
      return;
    }

    historicoElementosRef.current = historicoElementosRef.current.slice(0, -1);
    refazimentoElementosRef.current = [...refazimentoElementosRef.current, elementosRef.current];
    setElementos(estadoAnterior);
    setElementoSelecionadoId(null);
    setPerfil(null);
    setPontoDestacado(null);
  }

  function refazerElementos() {
    const proximoEstado = refazimentoElementosRef.current.at(-1);
    if (!proximoEstado) {
      return;
    }

    refazimentoElementosRef.current = refazimentoElementosRef.current.slice(0, -1);
    historicoElementosRef.current = [...historicoElementosRef.current, elementosRef.current];
    setElementos(proximoEstado);
    setElementoSelecionadoId(null);
    setPerfil(null);
    setPontoDestacado(null);
  }

  useEffect(() => {
    function aoPressionarAtalho(evento: KeyboardEvent) {
      const alvo = evento.target;
      const alvoEditavel =
        alvo instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName) || alvo.isContentEditable);

      if (alvoEditavel || !evento.ctrlKey || evento.altKey || evento.key.toLowerCase() !== "z") {
        return;
      }

      evento.preventDefault();
      if (evento.shiftKey) {
        refazerElementos();
      } else {
        desfazerElementos();
      }
    }

    window.addEventListener("keydown", aoPressionarAtalho);
    return () => window.removeEventListener("keydown", aoPressionarAtalho);
  }, []);

  function adicionarElemento(elemento: ElementoMapa) {
    alterarElementosComHistorico((itens) => [elemento, ...itens]);
  }

  function atualizarElemento(elementoAtualizado: ElementoMapa) {
    alterarElementosComHistorico((itens) =>
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
    alterarElementosComHistorico((itens) => itens.filter((item) => item.id !== id));
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
      setAlerta({
        tipo: resultado.estatisticas.limiteAmostrasAtingido ? "aviso" : "sucesso",
        mensagem: resultado.estatisticas.avisoAmostragem ?? "Perfil de elevação calculado pelo backend."
      });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível calcular o perfil."
      });
    } finally {
      setCarregandoPerfil(false);
    }
  }

  function iniciarSelecaoAreaCurvas() {
    if (carregandoCurvas) {
      return;
    }

    setSelecionandoAreaCurvas(true);
    setAlerta({
      tipo: "aviso",
      mensagem: "Desenhe um retângulo no mapa para definir a área das curvas de nível."
    });
  }

  async function gerarCurvasDaAreaSelecionada(boundsSelecionado: BboxCurvasNivel) {
    setSelecionandoAreaCurvas(false);
    setCarregandoCurvas(true);
    try {
      const resultado = await gerarCurvasNivel(boundsSelecionado, intervaloCurvasMetros);
      setCurvasNivel(resultado);
      setVisibilidadeCamadaCurvasNivel(true);
      setAlerta({
        tipo: resultado.features.length > 0 ? "sucesso" : "aviso",
        mensagem:
          resultado.features.length > 0
            ? `${resultado.features.length} curva(s) de nível gerada(s) para a área selecionada.`
            : "Nenhuma curva de nível encontrada nessa área com os parâmetros atuais."
      });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível gerar curvas de nível."
      });
    } finally {
      setCarregandoCurvas(false);
    }
  }

  async function executarExportacao(acao: () => void | Promise<void>) {
    try {
      await acao();
      setAlerta({ tipo: "sucesso", mensagem: "Exportação iniciada." });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível exportar."
      });
    }
  }

  function obterElementoSelecionado(): ElementoMapa | null {
    return elementos.find((item) => item.id === elementoSelecionadoId) ?? null;
  }

  async function buscarLocalizacao() {
    setCarregandoLocalizacao(true);
    try {
      const resultados = await pesquisarLocalizacao(termoLocalizacao);
      const primeira = resultados[0];
      if (!primeira) {
        setAlerta({ tipo: "aviso", mensagem: "Nenhuma localização encontrada." });
        return;
      }

      setLocalizacaoFocada(primeira);
      setAlerta({ tipo: "sucesso", mensagem: `Localização encontrada: ${primeira.nome}` });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível pesquisar a localização."
      });
    } finally {
      setCarregandoLocalizacao(false);
    }
  }

  return (
    <div className="aplicacao">
      {inicializando && <CarregamentoInicial />}

      <BarraSuperior />

      <main className="area-trabalho">
        <div className="coluna-mapa">
          <MapaAltimetria
            tema={tema}
            camadaBase={camadaBase}
            rotulosMapaAtivos={rotulosMapaAtivos}
            localizacaoFocada={localizacaoFocada}
            aoAlterarCamadaBase={setCamadaBase}
            camadasVisiveis={camadasVisiveis}
            elementos={elementos}
            camadasImportadas={camadasImportadas}
            curvasNivel={curvasNivel}
            visibilidadeCamadaCurvasNivel={visibilidadeCamadaCurvasNivel}
            pontoDestacado={pontoDestacado}
            elementoSelecionadoId={elementoSelecionadoId}
            selecaoAreaCurvasAtiva={selecionandoAreaCurvas}
            selecaoPontoAltitudeAtiva={selecionandoPontoAltitude}
            aoElementoCriado={adicionarElemento}
            aoElementoAtualizado={atualizarElemento}
            aoElementoRemovido={removerElemento}
            aoSelecionarElemento={setElementoSelecionadoId}
            aoLimparSelecao={limparSelecaoElemento}
            aoBoundsAlterado={setBoundsMapa}
            aoAreaCurvasSelecionada={gerarCurvasDaAreaSelecionada}
            aoCancelarSelecaoAreaCurvas={() => setSelecionandoAreaCurvas(false)}
            aoPontoAltitudeSelecionado={analisarPontoNoMapa}
            aoCancelarSelecaoPontoAltitude={() => setSelecionandoPontoAltitude(false)}
          />
        </div>

        <PainelDireito
          resultadoAtual={resultadoAtual}
          elementos={elementos}
          elementoSelecionadoId={elementoSelecionadoId}
          perfil={perfil}
          carregandoPerfil={carregandoPerfil}
          curvasNivel={curvasNivel}
          visibilidadeCamadaCurvasNivel={visibilidadeCamadaCurvasNivel}
          carregandoCurvas={carregandoCurvas}
          selecionandoAreaCurvas={selecionandoAreaCurvas}
          selecionandoPontoAltitude={selecionandoPontoAltitude}
          termoLocalizacao={termoLocalizacao}
          carregandoLocalizacao={carregandoLocalizacao}
          rotulosMapaAtivos={rotulosMapaAtivos}
          intervaloCurvasMetros={intervaloCurvasMetros}
          camadasImportadas={camadasImportadas}
          aoAnalisarPonto={iniciarAnalisePonto}
          aoAlterarTermoLocalizacao={setTermoLocalizacao}
          aoPesquisarLocalizacao={buscarLocalizacao}
          aoAlternarRotulosMapa={() => setRotulosMapaAtivos((valor) => !valor)}
          aoSelecionarElemento={(id) => setElementoSelecionadoId(id || null)}
          aoAnalisarPerfil={analisarPerfil}
          aoLimparAnalise={() => {
            setPerfil(null);
            setPontoDestacado(null);
          }}
          aoAlterarIntervaloCurvas={setIntervaloCurvasMetros}
          aoGerarCurvas={iniciarSelecaoAreaCurvas}
          aoLimparCurvas={() => {
            setCurvasNivel(null);
            setSelecionandoAreaCurvas(false);
          }}
          aoImportarArquivo={() => inputArquivoRef.current?.click()}
          aoAlternarCamadaImportada={alternarCamadaImportada}
          aoAlternarCamadaCurvasNivel={() => setVisibilidadeCamadaCurvasNivel((valor) => !valor)}
          aoExportarRelatorio={() => executarExportacao(() => exportarRelatorioHtml(perfil))}
          aoExportarCsv={() => executarExportacao(() => exportarPerfilCsv(perfil))}
          aoExportarGeoJson={() => executarExportacao(() => exportarDesenhosGeoJson(elementos, camadasImportadas))}
          aoExportarElementoGeoJson={() => executarExportacao(() => exportarElementoGeoJson(obterElementoSelecionado()))}
          aoExportarElementoKml={() => executarExportacao(() => exportarElementoKml(obterElementoSelecionado()))}
          aoExportarCurvasKml={() => executarExportacao(() => exportarCurvasNivelKml(curvasNivel))}
          aoExportarCurvasKmz={() => executarExportacao(() => exportarCurvasNivelKmz(curvasNivel))}
          aoExportarCurvasDxf={() => executarExportacao(() => exportarCurvasNivelDxf(curvasNivel))}
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
