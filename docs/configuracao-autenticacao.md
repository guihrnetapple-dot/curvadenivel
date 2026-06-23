# Configuração de autenticação

Estas etapas precisam ser aplicadas no painel do banco de dados e nos provedores externos. O código prepara os redirecionamentos e o fluxo de confirmação por código, mas não consegue configurar domínio, SMTP, template e Twilio sozinho.

## URL Configuration

Use como Site URL de produção:

```text
https://geocampo.itefagro.net.br
```

Redirect URLs permitidas:

```text
https://geocampo.itefagro.net.br/**
http://127.0.0.1:5173/**
http://localhost:5173/**
```

Inclua previews específicos da Vercel somente quando necessário. Evite wildcard amplo entre projetos.

## Modo de verificação de e-mail

Variável pública:

```text
VITE_EMAIL_VERIFICATION_MODE=auto
```

Modos:

- `auto`: usa verificação da aplicação quando o cadastro já cria sessão; mantém fallback nativo quando o banco de dados não retorna sessão.
- `app`: força o fluxo da aplicação.
- `native`: usa o fallback nativo do banco de dados.

Para o comportamento final, desative `Confirm email` nativo no banco de dados apenas depois de:

1. aplicar as migrations;
2. publicar as Edge Functions;
3. configurar secrets;
4. configurar domínio e provedor de e-mail;
5. testar cadastro, pular confirmação e confirmação posterior.

## E-mail transacional próprio

Não é possível enviar profissionalmente como `@vercel.app`. Use domínio controlado e verificado.

Checklist manual:

- criar conta no provedor escolhido;
- validar domínio;
- configurar SPF;
- configurar DKIM;
- publicar DMARC;
- criar remetente `GeoCampo <conta@dominio>`;
- desativar rastreamento de clique para autenticação;
- testar Gmail, Outlook e caixa corporativa.

## SMTP personalizado

Configure SMTP personalizado no painel do banco de dados para os e-mails nativos restantes:

- recuperação de senha;
- alteração de e-mail nativa, se ainda usada no fallback;
- reautenticação;
- convites;
- avisos de segurança.

Nunca versionar host, usuário, senha SMTP ou tokens.

## Template "Confirm signup" para fallback nativo

Enquanto o fallback nativo existir, remova `{{ .ConfirmationURL }}` e use somente o token:

```html
<h1>Confirme seu cadastro</h1>
<p>Use o código abaixo para confirmar seu e-mail no GeoCampo.</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{{ .Token }}</p>
<p>O código expira em breve e pode ser usado uma única vez.</p>
<p>Se você não solicitou este cadastro, ignore esta mensagem.</p>
```

## Edge Functions

Secrets necessários no projeto do banco de dados:

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_FROM_NAME=GeoCampo
EMAIL_REPLY_TO=
OTP_HMAC_SECRET=
OTP_TTL_SECONDS=600
OTP_RESEND_SECONDS=60
OTP_MAX_ATTEMPTS=5
ALLOWED_ORIGINS=https://geocampo.itefagro.net.br,http://localhost:5173,http://127.0.0.1:5173
```

Funções:

```bash
supabase functions deploy request-email-verification --project-ref nidjsgcqscjtodphyaic
supabase functions deploy verify-email-code --project-ref nidjsgcqscjtodphyaic
```

## WhatsApp

A confirmação por WhatsApp depende de configuração manual no Twilio Verify:

- criar Verify Service;
- habilitar canal WhatsApp;
- aprovar remetente exigido pela Meta/Twilio;
- configurar países permitidos e antifraude;
- adicionar secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `TWILIO_VERIFY_SERVICE_SID`;
- testar número real em E.164.

## Rollback

1. Definir `VITE_EMAIL_VERIFICATION_MODE=native`.
2. Reativar `Confirm email` nativo.
3. Manter tabelas/campos novos sem apagar dados.
4. Reimplantar frontend.
5. Monitorar logs de Auth, Edge Functions e provedor de e-mail.
