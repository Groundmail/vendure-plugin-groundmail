<p align="center">
  <a href="https://groundmail.dev?utm_source=github&utm_medium=readme&utm_campaign=vendure-plugin-groundmail">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://app.groundmail.dev/images/github/readme-logo-dark.png">
      <img alt="Groundmail" src="https://app.groundmail.dev/images/github/readme-logo-light.png" height="44">
    </picture>
  </a>
</p>


<h1 align="center">Groundmail for Vendure</h1>

<p align="center">
  An email sender for the <a href="https://vendure.io">Vendure</a> EmailPlugin, for Vendure 2 and 3.<br>
  Order confirmations, password resets and email address verification go out through the Groundmail API.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vendure-plugin-groundmail"><img alt="npm" src="https://img.shields.io/npm/v/vendure-plugin-groundmail?color=a3461f&label=npm"></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-b48f62"></a>
</p>

<p align="center">
  <a href="https://docs.groundmail.dev/frameworks/vendure?utm_source=github&utm_medium=readme&utm_campaign=vendure-plugin-groundmail">Docs</a> ·
  <a href="https://app.groundmail.dev/signup?utm_source=github&utm_medium=readme&utm_campaign=vendure-plugin-groundmail">Get a free account</a> ·
  <a href="https://groundmail.dev?utm_source=github&utm_medium=readme&utm_campaign=vendure-plugin-groundmail">groundmail.dev</a>
</p>

---

## Install

```bash
npm install vendure-plugin-groundmail
```

```bash
GROUNDMAIL_API_KEY=gm_your_key_here
```

## Configure

Swap `EmailPlugin.init()` for `GroundmailEmailPlugin.init()`. It takes the same options, without `transport`:

```ts
// vendure-config.ts
import path from 'path'
import { VendureConfig } from '@vendure/core'
import { defaultEmailHandlers, FileBasedTemplateLoader } from '@vendure/email-plugin'
import { GroundmailEmailPlugin } from 'vendure-plugin-groundmail'

export const config: VendureConfig = {
  // ...
  plugins: [
    GroundmailEmailPlugin.init({
      handlers: defaultEmailHandlers,
      templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
      globalTemplateVars: {
        fromAddress: '"Acme" <orders@yourdomain.com>',
        verifyEmailAddressUrl: 'https://shop.yourdomain.com/verify',
        passwordResetUrl: 'https://shop.yourdomain.com/password-reset',
        changeEmailAddressUrl: 'https://shop.yourdomain.com/verify-email-address-change',
      },
      groundmail: { apiKey: process.env.GROUNDMAIL_API_KEY },
    }),
  ],
}
```

The `fromAddress` must be on a domain you have verified in Groundmail.

Or keep `EmailPlugin.init()` and set the sender yourself:

```ts
import { EmailPlugin } from '@vendure/email-plugin'
import { GroundmailEmailSender } from 'vendure-plugin-groundmail'

EmailPlugin.init({
  // handlers, templateLoader, globalTemplateVars as before
  transport: { type: 'none' },
  emailSender: new GroundmailEmailSender({ apiKey: process.env.GROUNDMAIL_API_KEY }),
})
```

Vendure still renders your Handlebars and MJML templates. Groundmail sends the result, with the plain-text part, cc, bcc, reply-to and attachments (from `content` or a `path` to a file or URL).

With `devMode: true`, or the `file` and `testing` transports, emails go to the dev mailbox or your test callback as usual and nothing is sent.

## Options

| Option | Purpose |
|--------|---------|
| `apiKey` | Groundmail API key. Falls back to `GROUNDMAIL_API_KEY` |
| `from` | From address when a handler sets none |
| `replyTo` | Reply-To when a handler sets none |
| `tags` | Tags added to every email, e.g. `{ app: 'shop' }` |
| `headers` | Headers added to every email |
| `baseUrl` | Override the API base URL |

## Contributing

Found a bug or want something added? [Open an issue](https://github.com/Groundmail/vendure-plugin-groundmail/issues). This code is published here on each release, so we port fixes rather than merging pull requests directly. The HTTP client itself is the [`groundmail`](https://www.npmjs.com/package/groundmail) package.

## Why Groundmail

- **Our own mail servers and IP space.** Your password resets and receipts don't share a pool with bulk marketing senders.
- **Transactional email only.** No newsletters or cold outreach on the platform, which keeps the sending reputation clean.
- **Start free.** Free covers 3,000 emails a month. After that, pay as you go is $15 a month with 20,000 emails included, then from $0.70 per 1,000, less as you grow. [Pricing](https://groundmail.dev/pricing/?utm_source=github&utm_medium=readme&utm_campaign=vendure-plugin-groundmail)
- **Built for code and for agents.** REST API, SMTP, SDKs for Node, Python, Go, PHP and Ruby, a CLI, and an MCP server for Claude, ChatGPT and Cursor.

## All Groundmail libraries

| Use | Package |
|-----|---------|
| Node.js / TypeScript | [`groundmail`](https://www.npmjs.com/package/groundmail) on npm |
| Python (Django), Go, Ruby (Rails Action Mailer) | [Groundmail/groundmail-sdks](https://github.com/Groundmail/groundmail-sdks) |
| PHP | [Groundmail/groundmail-php](https://github.com/Groundmail/groundmail-php) |
| Laravel | [Groundmail/groundmail-laravel](https://github.com/Groundmail/groundmail-laravel) |
| Symfony Mailer | [Groundmail/groundmail-symfony-mailer](https://github.com/Groundmail/groundmail-symfony-mailer) |
| Nodemailer | [Groundmail/groundmail-nodemailer](https://github.com/Groundmail/groundmail-nodemailer) |
| NestJS | [Groundmail/nestjs-groundmail](https://github.com/Groundmail/nestjs-groundmail) |
| Strapi | [Groundmail/strapi-provider-email-groundmail](https://github.com/Groundmail/strapi-provider-email-groundmail) |
| Medusa | [Groundmail/medusa-notification-groundmail](https://github.com/Groundmail/medusa-notification-groundmail) |
| AdonisJS | [Groundmail/adonisjs-groundmail](https://github.com/Groundmail/adonisjs-groundmail) |
| Phoenix (Swoosh) | [Groundmail/swoosh_groundmail](https://github.com/Groundmail/swoosh_groundmail) |
| CLI | [`groundmail-cli`](https://www.npmjs.com/package/groundmail-cli) on npm |
| MCP server (Claude, ChatGPT, Cursor) | [Groundmail/groundmail-mcp](https://github.com/Groundmail/groundmail-mcp) |
| Agent skills and Claude Code plugin | [Groundmail/groundmail-skills](https://github.com/Groundmail/groundmail-skills) |
| Email templates (React Email, MJML, HTML) | [Groundmail/email-templates](https://github.com/Groundmail/email-templates) |

[Website](https://groundmail.dev?utm_source=github&utm_medium=readme&utm_campaign=vendure-plugin-groundmail) · [Docs](https://docs.groundmail.dev?utm_source=github&utm_medium=readme&utm_campaign=vendure-plugin-groundmail) · [Pricing](https://groundmail.dev/pricing/?utm_source=github&utm_medium=readme&utm_campaign=vendure-plugin-groundmail) · [Sign up free](https://app.groundmail.dev/signup?utm_source=github&utm_medium=readme&utm_campaign=vendure-plugin-groundmail)
