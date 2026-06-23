import { useEffect, useRef, useState } from "react";

interface ToastAlertaProps {
  mensagem: string | null;
  tipo?: "sucesso" | "erro" | "aviso";
  duracaoMs?: number;
  aoFechar?: () => void;
}

export function ToastAlerta({ mensagem, tipo = "sucesso", duracaoMs = 4200, aoFechar }: ToastAlertaProps) {
  const [renderizar, setRenderizar] = useState(Boolean(mensagem));
  const [visivel, setVisivel] = useState(false);
  const aoFecharRef = useRef(aoFechar);

  useEffect(() => {
    aoFecharRef.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    if (!mensagem) {
      setVisivel(false);
      const tempoRemocao = window.setTimeout(() => setRenderizar(false), 220);
      return () => window.clearTimeout(tempoRemocao);
    }

    setRenderizar(true);
    const tempoEntrada = window.setTimeout(() => setVisivel(true), 20);
    const tempoSaida = window.setTimeout(() => setVisivel(false), duracaoMs);
    const tempoFechamento = window.setTimeout(() => {
      setRenderizar(false);
      aoFecharRef.current?.();
    }, duracaoMs + 240);

    return () => {
      window.clearTimeout(tempoEntrada);
      window.clearTimeout(tempoSaida);
      window.clearTimeout(tempoFechamento);
    };
  }, [duracaoMs, mensagem]);

  if (!renderizar || !mensagem) {
    return null;
  }

  return (
    <div className={`toast-alerta ${tipo} ${visivel ? "visivel" : "saindo"}`} role={tipo === "erro" ? "alert" : "status"}>
      <span>{mensagem}</span>
    </div>
  );
}
