interface Props {
  erro?: string;
}

const secoesTermos = [
  "Finalidade da Plataforma",
  "Responsabilidade do Usuário",
  "Limitações Técnicas",
  "Política de Privacidade",
  "LGPD",
  "Cookies e Sessão",
  "Disponibilidade do Serviço",
  "Limitação de Responsabilidade",
  "Dados Cartográficos e Altimétricos",
  "Atualizações do Sistema",
  "Uso Profissional",
  "Aceite dos Termos"
];

export function ConsentBox({ erro }: Props) {
  return (
    <section
      className="auth-consentimentos auth-consentimentos-leitura"
      aria-invalid={Boolean(erro)}
      aria-describedby={erro ? "consentimentos-erro" : undefined}
    >
      <div className="auth-consentimentos-topo">
        <strong>Termos de Uso, Privacidade e Consentimentos</strong>
        <span>Leia as condições abaixo antes de criar sua conta no GeoCampo.</span>
      </div>

      <div className="auth-termos-caixa" tabIndex={0} aria-label="Texto completo dos termos de uso do GeoCampo">
        <div className="auth-termos-sumario" aria-label="Sumário dos termos">
          <strong>Sumário</strong>
          <ol>
            {secoesTermos.map((secao) => (
              <li key={secao}>{secao}</li>
            ))}
          </ol>
        </div>

        <article className="auth-termos-conteudo">
          <section>
            <h3>1. Finalidade da Plataforma</h3>
            <p>
              O GeoCampo é uma plataforma de apoio técnico voltada a análises preliminares de topografia, irrigação, planejamento rural,
              consulta altimétrica, visualização cartográfica, desenho de áreas e geração de informações auxiliares para estudos iniciais.
              A plataforma organiza dados geográficos e altimétricos para facilitar a leitura do terreno antes de decisões técnicas mais
              aprofundadas.
            </p>
            <p>
              Os resultados apresentados possuem caráter informativo e orientativo. Eles ajudam na triagem, no planejamento inicial e na
              comunicação técnica, mas não substituem medições, projetos, estudos ou laudos elaborados por profissional habilitado.
            </p>
          </section>

          <section>
            <h3>2. Responsabilidade do Usuário</h3>
            <p>
              O usuário é responsável por conferir os dados inseridos, validar coordenadas, interpretar corretamente os resultados e verificar
              se as informações são compatíveis com a realidade de campo. O uso da plataforma ocorre por conta e risco do usuário.
            </p>
            <p>
              Antes de utilizar qualquer informação em projeto, obra, contratação, negociação, relatório, regularização ou decisão operacional,
              o usuário deve validar os resultados com levantamentos específicos e, quando necessário, com profissional legalmente habilitado.
            </p>
          </section>

          <section>
            <h3>3. Limitações Técnicas</h3>
            <p>
              O GeoCampo depende de bases cartográficas, altimétricas, geográficas e de terceiros. Essas bases podem apresentar atrasos de
              atualização, resolução limitada, inconsistências locais, falhas de cobertura, variações de precisão, indisponibilidade temporária
              ou divergências em relação à situação real do terreno.
            </p>
            <p>
              A plataforma não garante precisão absoluta dos dados obtidos ou exibidos. As informações podem conter limitações inerentes às
              fontes utilizadas, à qualidade das coordenadas informadas, à conexão do usuário, ao navegador, ao dispositivo e ao processamento
              disponível no momento da consulta.
            </p>
          </section>

          <section>
            <h3>4. Política de Privacidade</h3>
            <p>
              Para criar e manter uma conta, o GeoCampo pode coletar dados como nome, e-mail, profissão, área de atuação, empresa, país, estado,
              cidade, telefone/WhatsApp, registros de confirmação, preferências de sessão e informações técnicas necessárias à segurança e ao
              funcionamento da plataforma.
            </p>
            <p>
              Esses dados são utilizados para autenticação, identificação do usuário, suporte, segurança, prevenção de abuso, comunicação
              operacional, melhoria do serviço e cumprimento de obrigações legais ou regulatórias aplicáveis.
            </p>
          </section>

          <section>
            <h3>5. LGPD</h3>
            <p>
              O tratamento de dados pessoais observa a Lei Geral de Proteção de Dados Pessoais (LGPD). O usuário pode solicitar correção,
              atualização, confirmação de tratamento ou exclusão de dados pessoais, respeitadas as hipóteses legais de conservação, auditoria,
              segurança, prevenção a fraude e cumprimento de obrigação legal.
            </p>
            <p>
              Os dados são armazenados em ambientes técnicos compatíveis com a operação da plataforma e protegidos por controles razoáveis de
              segurança. Nenhum sistema conectado à internet é absolutamente imune a riscos, mas o GeoCampo adota medidas para reduzir acessos
              indevidos e preservar a integridade das informações.
            </p>
          </section>

          <section>
            <h3>6. Cookies e Sessão</h3>
            <p>
              A plataforma utiliza cookies, armazenamento local ou tecnologias equivalentes para manter sessão, autenticação, segurança,
              preferências básicas, proteção contra uso indevido e funcionamento correto da experiência do usuário.
            </p>
            <p>
              Sem esses recursos, algumas funcionalidades podem não operar adequadamente, incluindo login, confirmação de identidade,
              persistência de sessão, preferências do usuário e recursos de segurança.
            </p>
          </section>

          <section>
            <h3>7. Disponibilidade do Serviço</h3>
            <p>
              O GeoCampo pode passar por manutenções, atualizações, instabilidades, limitações de provedores externos, indisponibilidade de rede
              ou interrupções temporárias. A plataforma busca manter operação estável, mas não garante disponibilidade contínua e ininterrupta.
            </p>
          </section>

          <section className="auth-termos-alerta">
            <h3>8. Limitação de Responsabilidade</h3>
            <p>
              O GeoCampo não deve ser utilizado como única fonte para tomada de decisão técnica, financeira ou jurídica; definição de limites
              territoriais; execução de obras; implantação de sistemas de irrigação; movimentação de terra; obras de engenharia; regularização
              fundiária; elaboração de laudos; projetos executivos; ou qualquer ação que dependa de precisão técnica comprovada.
            </p>
            <p>
              As informações geradas não substituem levantamento topográfico em campo, levantamento planialtimétrico, georreferenciamento,
              estudos técnicos especializados, laudos técnicos, análises executivas ou projetos executivos. Toda decisão técnica deve ser
              validada por profissional habilitado e por levantamentos específicos realizados em campo quando necessário.
            </p>
          </section>

          <section>
            <h3>9. Dados Cartográficos e Altimétricos</h3>
            <p>
              Mapas, curvas de nível, perfis de elevação, altitudes, coordenadas, áreas, distâncias e demais elementos gerados pela plataforma
              devem ser interpretados como apoio visual e informativo. Diferenças entre a base digital e a realidade local podem ocorrer por
              vegetação, obras recentes, alterações de relevo, erros de origem, escala, resolução ou método de captura dos dados.
            </p>
          </section>

          <section>
            <h3>10. Atualizações do Sistema</h3>
            <p>
              O GeoCampo pode receber melhorias, correções, alterações de interface, ajustes de desempenho, mudanças de provedores técnicos e
              atualizações de segurança. Essas alterações podem modificar a forma de apresentação dos dados, sem eliminar a responsabilidade do
              usuário de validar as informações antes do uso profissional.
            </p>
          </section>

          <section>
            <h3>11. Uso Profissional</h3>
            <p>
              O uso profissional da plataforma exige interpretação técnica responsável. O usuário reconhece que deve avaliar se possui
              qualificação suficiente para interpretar os resultados e que, em atividades regulamentadas, deve observar normas técnicas,
              legislação aplicável e exigências de conselhos profissionais ou órgãos competentes.
            </p>
            <p>
              Comunicações por e-mail e WhatsApp podem ser enviadas para confirmação de conta, segurança, suporte, avisos operacionais,
              atualizações relevantes, informações sobre uso da plataforma e comunicações profissionais relacionadas ao GeoCampo.
            </p>
          </section>

          <section>
            <h3>12. Aceite dos Termos</h3>
            <p>
              Ao criar sua conta, o usuário declara que leu, compreendeu e aceita integralmente estes Termos de Uso, a Política de Privacidade,
              as condições de tratamento de dados, o uso de cookies essenciais, as comunicações operacionais e profissionais descritas, além das
              limitações técnicas e responsabilidades indicadas neste documento.
            </p>
          </section>
        </article>
      </div>

      <p className="auth-termos-aceite">
        Ao criar sua conta você declara que leu, compreendeu e aceita integralmente os Termos de Uso, Política de Privacidade e condições
        descritas neste documento.
      </p>

      {erro && (
        <small id="consentimentos-erro" className="auth-erro-campo">
          {erro}
        </small>
      )}
    </section>
  );
}
