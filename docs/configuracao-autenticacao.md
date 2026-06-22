# Configuração de autenticação

Estas etapas precisam ser aplicadas no painel do serviço de autenticação. O código do projeto prepara os redirecionamentos e a confirmação por código, mas não consegue alterar essas configurações externas sozinho.

## URL Configuration

Use como Site URL de produção:

```text
https://curvadenivel.vercel.app
```

Redirect URLs permitidas:

```text
https://curvadenivel.vercel.app/**
http://127.0.0.1:5173/**
http://localhost:5173/**
```

Inclua `http://localhost:3000/**` somente se alguma ferramenta de preview usada pelo time realmente abrir nessa porta.

Para previews da Vercel, prefira permitir URLs específicas do projeto ou do branch quando possível. Se o painel exigir um padrão, use um padrão restrito ao projeto, por exemplo:

```text
https://curvadenivel-guihrnetapple-dot.vercel.app/**
https://curvadenivel-*.vercel.app/**
```

Não deixe `localhost` como Site URL de produção.

## Template "Confirm signup"

Configure o template em português usando o token, não um link direto.

Assunto:

```text
Seu código de confirmação — Curva de Nível
```

Corpo sugerido:

```html
<h1>Confirme seu cadastro</h1>
<p>Use o código abaixo para confirmar seu e-mail e continuar o cadastro na Curva de Nível.</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{{ .Token }}</p>
<p>Se você não solicitou este cadastro, ignore esta mensagem.</p>
```

Não inclua menções ao fornecedor de autenticação, "powered by" ou dados fornecidos pelo usuário sem escape.

## SMTP personalizado

Para remover o remetente padrão do serviço de autenticação e usar a identidade "Curva de Nível", configure um SMTP próprio no painel.

Campos necessários:

```text
host=
porta=
usuário=
senha=
remetente=
nome do remetente=Curva de Nível
```

Não salve credenciais SMTP no frontend, em `.env.example`, no GitHub ou em qualquer arquivo versionado.

## Confirmação de e-mail

Mantenha a confirmação de e-mail habilitada. Não habilite autoconfirmação apenas para contornar problemas de cadastro.

Revise no painel:

- limite de reenvio de e-mail;
- expiração do código;
- domínio de envio;
- SPF, DKIM e DMARC quando houver domínio próprio.
