import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { EmailPlugin, type EmailDetails } from '@vendure/email-plugin'
import { describe, expect, it, vi } from 'vitest'
import { GroundmailEmailPlugin, GroundmailEmailSender, splitAddresses } from './index'

function fakeFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).startsWith('https://cdn.shop.test/')) {
      return new Response(Buffer.from('remote-pdf'), { status: 200 })
    }
    return new Response(JSON.stringify({ id: 'em_123', status: 'queued' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
}

function lastSend(fetch: ReturnType<typeof fakeFetch>) {
  const call = fetch.mock.calls.filter(([url]) => String(url).endsWith('/emails')).at(-1)
  const [url, init] = call as unknown as [string, RequestInit]
  return { url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) }
}

function email(overrides: Partial<EmailDetails> & { text?: string } = {}): EmailDetails {
  return {
    from: '"Shop" <noreply@shop.test>',
    recipient: 'buyer@example.com',
    subject: 'Order confirmation for #T0001',
    body: '<p>Thanks for your order</p>',
    attachments: [],
    ...overrides,
  } as EmailDetails
}

describe('vendure-plugin-groundmail', () => {
  it('sends a generated email through the API', async () => {
    const fetch = fakeFetch()
    const sender = new GroundmailEmailSender({ apiKey: 'gm_test_key', baseUrl: 'https://api.test', fetch })

    await sender.send(email({ text: 'Thanks for your order' }), { type: 'none' })

    const { url, headers, body } = lastSend(fetch)
    expect(url).toBe('https://api.test/emails')
    expect(headers.get('authorization')).toBe('Bearer gm_test_key')
    expect(body).toMatchObject({
      from: '"Shop" <noreply@shop.test>',
      to: 'buyer@example.com',
      subject: 'Order confirmation for #T0001',
      html: '<p>Thanks for your order</p>',
      text: 'Thanks for your order',
    })
    expect(body.attachments).toBeUndefined()
  })

  it('sends when no transport options are given', async () => {
    const fetch = fakeFetch()
    const sender = new GroundmailEmailSender({ apiKey: 'gm_test_key', fetch })
    await sender.send(email())
    expect(lastSend(fetch).body.to).toBe('buyer@example.com')
  })

  it('maps cc, bcc, reply-to, tags and headers', async () => {
    const fetch = fakeFetch()
    const sender = new GroundmailEmailSender({
      apiKey: 'gm_test_key',
      fetch,
      replyTo: 'support@shop.test',
      tags: { app: 'shop' },
      headers: { 'X-Store': 'eu' },
    })

    await sender.send(
      email({ recipient: 'a@example.com, "Doe, Jane" <jane@example.com>', cc: 'ops@shop.test', bcc: 'audit@shop.test, log@shop.test' }),
      { type: 'none' },
    )
    expect(lastSend(fetch).body).toMatchObject({
      to: ['a@example.com', '"Doe, Jane" <jane@example.com>'],
      cc: 'ops@shop.test',
      bcc: ['audit@shop.test', 'log@shop.test'],
      reply_to: 'support@shop.test',
      headers: { 'X-Store': 'eu' },
    })

    await sender.send(email({ replyTo: 'orders@shop.test' }), { type: 'none' })
    expect(lastSend(fetch).body.reply_to).toBe('orders@shop.test')
  })

  it('uses the default From when the handler sets none', async () => {
    const fetch = fakeFetch()
    const sender = new GroundmailEmailSender({ apiKey: 'gm_test_key', fetch, from: 'Shop <orders@shop.test>' })
    await sender.send(email({ from: '' }), { type: 'none' })
    expect(lastSend(fetch).body.from).toBe('Shop <orders@shop.test>')

    const bare = new GroundmailEmailSender({ apiKey: 'gm_test_key', fetch })
    await expect(bare.send(email({ from: '' }), { type: 'none' })).rejects.toThrow(/From address/)
  })

  it('base64-encodes attachments from content, files, URLs and data URLs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gm-vendure-'))
    const file = join(dir, 'terms.txt')
    await writeFile(file, 'terms')
    const fetch = fakeFetch()
    const sender = new GroundmailEmailSender({ apiKey: 'gm_test_key', fetch })

    await sender.send(
      email({
        attachments: [
          { filename: 'invoice.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' },
          { filename: 'note.txt', content: 'hello', contentType: 'text/plain' },
          { filename: 'raw.txt', content: Buffer.from('b64').toString('base64'), encoding: 'base64' },
          { path: file },
          { path: 'https://cdn.shop.test/files/receipt.pdf?sig=1', contentType: 'application/pdf' },
          { filename: 'logo.png', path: 'data:image/png;base64,iVBORw0K', cid: 'logo@shop' },
          { filename: 'stream.txt', content: Readable.from([Buffer.from('str'), Buffer.from('eam')]) },
        ],
      }),
      { type: 'none' },
    )

    const b64 = (s: string) => Buffer.from(s).toString('base64')
    expect(lastSend(fetch).body.attachments).toEqual([
      { name: 'invoice.pdf', content_type: 'application/pdf', data: b64('pdf') },
      { name: 'note.txt', content_type: 'text/plain', data: b64('hello') },
      { name: 'raw.txt', content_type: 'application/octet-stream', data: b64('b64') },
      { name: 'terms.txt', content_type: 'application/octet-stream', data: b64('terms') },
      { name: 'receipt.pdf', content_type: 'application/pdf', data: b64('remote-pdf') },
      { name: 'logo.png', content_type: 'application/octet-stream', data: 'iVBORw0K', content_id: 'logo@shop' },
      { name: 'stream.txt', content_type: 'application/octet-stream', data: b64('stream') },
    ])
  })

  it('reports API errors', async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'Domain not verified' } }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const sender = new GroundmailEmailSender({ apiKey: 'gm_test_key', fetch })
    await expect(sender.send(email(), { type: 'none' })).rejects.toThrow(/Groundmail: failed to send .*buyer@example.com/)
  })

  it('needs an API key', async () => {
    const saved = process.env.GROUNDMAIL_API_KEY
    delete process.env.GROUNDMAIL_API_KEY
    try {
      const sender = new GroundmailEmailSender({ fetch: fakeFetch() })
      await expect(sender.send(email(), { type: 'none' })).rejects.toThrow(/API key/)
    } finally {
      if (saved !== undefined) process.env.GROUNDMAIL_API_KEY = saved
    }
  })

  it('hands testing and file transports to the default sender', async () => {
    const fetch = fakeFetch()
    const onSend = vi.fn()
    const sender = new GroundmailEmailSender({ apiKey: 'gm_test_key', fetch })
    const details = email()
    await sender.send(details, { type: 'testing', onSend })
    expect(onSend).toHaveBeenCalledWith(details)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('splits address lists', () => {
    expect(splitAddresses(undefined)).toEqual([])
    expect(splitAddresses(' a@x.test ,b@x.test, ')).toEqual(['a@x.test', 'b@x.test'])
    expect(splitAddresses('"Doe, J" <j@x.test>, <k,@x.test>')).toEqual(['"Doe, J" <j@x.test>', '<k,@x.test>'])
  })

  it('sets up the EmailPlugin with the Groundmail sender', () => {
    const plugin = GroundmailEmailPlugin.init({ handlers: [], templatePath: tmpdir(), groundmail: { apiKey: 'gm_test_key' } })
    expect(plugin).toBe(EmailPlugin)
    const options = (EmailPlugin as unknown as { options: Record<string, unknown> }).options
    expect(options.transport).toEqual({ type: 'none' })
    expect(options.emailSender).toBeInstanceOf(GroundmailEmailSender)
    expect(options.groundmail).toBeUndefined()
  })
})
