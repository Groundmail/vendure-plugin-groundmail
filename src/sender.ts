import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { EmailDetails, EmailSender, EmailTransportOptions } from '@vendure/email-plugin'

type Groundmail = import('groundmail', { with: { 'resolution-mode': 'import' } }).Groundmail
type SendEmailParams = import('groundmail', { with: { 'resolution-mode': 'import' } }).SendEmailParams
type GroundmailAttachment = NonNullable<SendEmailParams['attachments']>[number]
type VendureAttachment = EmailDetails['attachments'][number]

export type GroundmailEmailSenderOptions = {
  /** Groundmail API key (`gm_…`). Falls back to `GROUNDMAIL_API_KEY`. */
  apiKey?: string
  /** From address used when an email handler doesn't set one. Must be on a verified domain. */
  from?: string
  /** Reply-To used when an email handler doesn't set one. */
  replyTo?: string
  /** Tags added to every send, e.g. `{ app: 'shop' }`. The email's type is not added for you. */
  tags?: Record<string, string>
  /** Headers added to every send. */
  headers?: Record<string, string>
  /** Override the API base URL. */
  baseUrl?: string
  /** Custom fetch implementation (tests, proxies). Also used to download attachments given by URL. */
  fetch?: typeof fetch
  /** Use this client instead of building one (tests). */
  client?: Groundmail
}

/**
 * Split an address list such as `a@x.com, "Doe, Jane" <jane@x.com>` into single
 * addresses, keeping commas inside quotes and angle brackets.
 */
export function splitAddresses(value: string | undefined | null): string[] {
  if (!value) return []
  const out: string[] = []
  let current = ''
  let quoted = false
  let angle = 0
  for (const char of value) {
    if (char === '"') quoted = !quoted
    else if (!quoted && char === '<') angle++
    else if (!quoted && char === '>') angle = Math.max(0, angle - 1)
    if (char === ',' && !quoted && angle === 0) {
      if (current.trim()) out.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) out.push(current.trim())
  return out
}

function oneOrMany(list: string[]): string | string[] {
  return list.length === 1 ? list[0] : list
}

function decodeDataUrl(url: string): Buffer {
  const comma = url.indexOf(',')
  const meta = url.slice(5, comma)
  const data = url.slice(comma + 1)
  return meta.endsWith(';base64') ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8')
}

/**
 * The EmailPlugin's `emailSender`: sends each generated email through the
 * Groundmail API. Use it with `transport: { type: 'none' }`. With the `file`
 * transport (dev mode) or the `testing` transport, emails are handed to the
 * plugin's own sender as usual, so local development never sends real mail.
 */
export class GroundmailEmailSender implements EmailSender {
  protected readonly options: GroundmailEmailSenderOptions
  private client_?: Promise<Groundmail>
  private fallback_?: Promise<EmailSender>

  constructor(options: GroundmailEmailSenderOptions = {}) {
    this.options = options
  }

  protected async client(): Promise<Groundmail> {
    if (this.options.client) return this.options.client
    this.client_ ??= (async () => {
      const apiKey = this.options.apiKey || process.env.GROUNDMAIL_API_KEY
      if (!apiKey) {
        throw new Error('Groundmail API key is missing. Pass `apiKey` to GroundmailEmailSender or set GROUNDMAIL_API_KEY.')
      }
      // groundmail ships ES modules only; import() loads it from CommonJS.
      const { Groundmail } = await import('groundmail')
      return new Groundmail(apiKey, { baseUrl: this.options.baseUrl, fetch: this.options.fetch })
    })().catch((error: unknown) => {
      this.client_ = undefined
      throw error
    })
    return this.client_
  }

  /** The EmailPlugin's default sender, for the `file` and `testing` transports. */
  protected async fallback(): Promise<EmailSender> {
    this.fallback_ ??= import('@vendure/email-plugin').then(({ NodemailerEmailSender }) => new NodemailerEmailSender())
    return this.fallback_
  }

  protected async attachmentContent(attachment: VendureAttachment): Promise<string> {
    const { content, path, encoding } = attachment
    if (content != null) {
      if (Buffer.isBuffer(content)) return content.toString('base64')
      if (content instanceof Uint8Array) return Buffer.from(content).toString('base64')
      if (typeof content === 'string') {
        if (encoding === 'base64') return content
        return Buffer.from(content, (encoding as BufferEncoding | undefined) || 'utf8').toString('base64')
      }
      const chunks: Buffer[] = []
      for await (const chunk of content as AsyncIterable<Buffer | string>) chunks.push(Buffer.from(chunk))
      return Buffer.concat(chunks).toString('base64')
    }
    if (typeof path === 'string' && path) {
      if (path.startsWith('data:')) return decodeDataUrl(path).toString('base64')
      if (/^https?:\/\//i.test(path)) {
        const response = await (this.options.fetch ?? fetch)(path)
        if (!response.ok) throw new Error(`Could not download attachment ${path}: HTTP ${response.status}`)
        return Buffer.from(await response.arrayBuffer()).toString('base64')
      }
      return (await readFile(path)).toString('base64')
    }
    const name = typeof attachment.filename === 'string' && attachment.filename ? ` "${attachment.filename}"` : ''
    throw new Error(`Attachment${name} has no content or path.`)
  }

  protected async toAttachments(attachments: VendureAttachment[] | undefined): Promise<GroundmailAttachment[]> {
    if (!attachments?.length) return []
    return Promise.all(
      attachments.map(async (attachment) => {
        const path = typeof attachment.path === 'string' ? attachment.path : undefined
        const filename =
          (typeof attachment.filename === 'string' && attachment.filename) ||
          (path && !path.startsWith('data:') ? basename(path.split('?')[0]) : 'attachment')
        return {
          filename,
          content: await this.attachmentContent(attachment),
          contentType: attachment.contentType || 'application/octet-stream',
          ...(attachment.cid ? { contentId: attachment.cid } : {}),
        }
      }),
    )
  }

  /** Build the Groundmail send request for an email the EmailPlugin generated. */
  async toSendParams(email: EmailDetails): Promise<SendEmailParams> {
    const from = email.from?.trim() || this.options.from
    if (!from) {
      throw new Error('Groundmail email has no From address. Set `from` in the email handler or in GroundmailEmailSender options.')
    }
    const to = splitAddresses(email.recipient)
    if (!to.length) throw new Error('Groundmail email has no recipient.')

    const params: SendEmailParams = { from, to: oneOrMany(to), subject: email.subject, html: email.body }
    const text = (email as { text?: string }).text
    if (text) params.text = text

    const cc = splitAddresses(email.cc)
    if (cc.length) params.cc = oneOrMany(cc)
    const bcc = splitAddresses(email.bcc)
    if (bcc.length) params.bcc = oneOrMany(bcc)
    const replyTo = splitAddresses(email.replyTo || this.options.replyTo)
    if (replyTo.length) params.replyTo = oneOrMany(replyTo)

    if (this.options.tags && Object.keys(this.options.tags).length) params.tags = { ...this.options.tags }
    if (this.options.headers && Object.keys(this.options.headers).length) params.headers = { ...this.options.headers }

    const attachments = await this.toAttachments(email.attachments)
    if (attachments.length) params.attachments = attachments
    return params
  }

  async send(email: EmailDetails, options?: EmailTransportOptions): Promise<void> {
    if (options && (options.type === 'file' || options.type === 'testing')) {
      await (await this.fallback()).send(email, options)
      return
    }
    const params = await this.toSendParams(email)
    try {
      await (await this.client()).emails.send(params)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Groundmail: failed to send "${email.subject}" to ${email.recipient}: ${message}`)
    }
  }
}
