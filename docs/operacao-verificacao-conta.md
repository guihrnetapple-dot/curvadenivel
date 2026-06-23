# Operação da verificação de conta

## Fluxo atual

- O banco de dados continua responsável por conta, senha, sessão e recuperação de senha.
- A verificação de e-mail da aplicação usa Edge Functions autenticadas.
- O código tem 6 dígitos, expira em 10 minutos e é armazenado apenas como HMAC.
- O usuário pode pular a confirmação e usar o sistema.
- O estado de e-mail confirmado vem de `profiles.verified_email` + `profiles.email_verified_at`.
- O estado de WhatsApp confirmado vem de `profiles.verified_whatsapp` + `profiles.whatsapp_verified_at`.

## Edge Functions

- `request-email-verification`
- `verify-email-code`

As duas exigem JWT válido e usam `service_role` somente no runtime da Edge Function.

## Secrets obrigatórios no banco de dados

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

Para WhatsApp:

```text
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
```

## Configurações manuais

1. Configurar domínio próprio no provedor de e-mail.
2. Validar SPF, DKIM e DMARC.
3. Configurar remetente `GeoCampo <conta@dominio-verificado>`.
4. Configurar SMTP personalizado para recuperação de senha e e-mails nativos restantes.
5. Personalizar templates nativos em português.
6. Desativar `Confirm email` nativo somente depois de testar o novo fluxo em produção.
7. Configurar Twilio Verify para canal WhatsApp antes de habilitar confirmação de WhatsApp real.

## Rollback

1. Definir `VITE_EMAIL_VERIFICATION_MODE=native` na Vercel.
2. Reativar `Confirm email` nativo.
3. Manter tabelas e campos novos; não apagar dados em produção.
4. Não remover Edge Functions; apenas deixar o frontend sem chamá-las.
5. Invalidar desafios pendentes se houver suspeita de abuso.
6. Trocar `OTP_HMAC_SECRET`, `RESEND_API_KEY` ou tokens Twilio se houver vazamento.

## Validação

```bash
npm run test
npm run build
```

Sem Deno instalado localmente, validar as Edge Functions pelo deploy e logs:

```bash
supabase functions deploy request-email-verification --project-ref nidjsgcqscjtodphyaic
supabase functions deploy verify-email-code --project-ref nidjsgcqscjtodphyaic
supabase functions logs request-email-verification --project-ref nidjsgcqscjtodphyaic
supabase functions logs verify-email-code --project-ref nidjsgcqscjtodphyaic
```
