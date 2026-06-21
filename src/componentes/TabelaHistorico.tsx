import type { ResultadoAltitude } from "../tipos/altimetria";
import { formatarDataHoraIso, formatarMetros, formatarNumero } from "../utilitarios/formatacao";

interface PropriedadesTabelaHistorico {
  historico: ResultadoAltitude[];
}

export function TabelaHistorico({ historico }: PropriedadesTabelaHistorico) {
  const linhas = historico.slice(0, 7);

  if (linhas.length === 0) {
    return <div className="estado-vazio">Nenhuma consulta registrada.</div>;
  }

  return (
    <div className="tabela-compacta">
      <table>
        <thead>
          <tr>
            <th>Lat</th>
            <th>Lng</th>
            <th>Altitude</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((item) => (
            <tr key={`${item.indice}-${item.consultadoEm}`}>
              <td>{formatarNumero(item.latitude, 4)}</td>
              <td>{formatarNumero(item.longitude, 4)}</td>
              <td>{formatarMetros(item.altitude, 2)}</td>
              <td>
                <span className={item.status === "valido" ? "marcador-status valido" : "marcador-status sem-dado"}>
                  {item.status === "valido" ? "Válido" : "Sem dado"}
                </span>
                <small>{formatarDataHoraIso(item.consultadoEm)}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
