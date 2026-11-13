import { EmailPlugin } from '@vendure/email-plugin'
import type { EmailPluginDevModeOptions, EmailPluginOptions } from '@vendure/email-plugin'
import { GroundmailEmailSender, type GroundmailEmailSenderOptions } from './sender'

export type GroundmailEmailPluginOptions = (
  | Omit<EmailPluginOptions, 'transport' | 'emailSender'>
  | Omit<EmailPluginDevModeOptions, 'emailSender'>
) & {
  /** Groundmail settings. `apiKey` falls back to `GROUNDMAIL_API_KEY`. */
  groundmail?: GroundmailEmailSenderOptions
}

/**
 * The Vendure EmailPlugin, set up to send through Groundmail. Takes the same
 * options as `EmailPlugin.init()` (handlers, templateLoader, globalTemplateVars,
 * devMode…) without `transport` or `emailSender`, plus `groundmail`.
 */
export const GroundmailEmailPlugin = {
  init(options: GroundmailEmailPluginOptions): ReturnType<typeof EmailPlugin.init> {
    const { groundmail, ...emailOptions } = options
    const emailSender = new GroundmailEmailSender(groundmail)
    if ('devMode' in emailOptions && emailOptions.devMode) {
      return EmailPlugin.init({ ...emailOptions, emailSender })
    }
    return EmailPlugin.init({
      ...(emailOptions as Omit<EmailPluginOptions, 'transport' | 'emailSender'>),
      transport: { type: 'none' },
      emailSender,
    })
  },
}
