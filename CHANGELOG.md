# Changelog

## 0.1.2 (2026-11-14)

- README: "Why Groundmail" now covers agent mailboxes and how each kind of mail sends from its own IPs.

## 0.1.1 (2026-11-13)

- The package now includes this changelog.

## 0.1.0 (2026-11-13)

- First release.
- `GroundmailEmailPlugin`: a drop-in replacement for `EmailPlugin.init()` that sends your Vendure store's emails through Groundmail.
- `GroundmailEmailSender`: an email sender for an existing `EmailPlugin` setup (`transport: { type: 'none' }`).
- Sends the HTML and plain-text parts, cc, bcc, reply-to and attachments. Vendure still renders your templates.
- Dev mode keeps writing to the dev mailbox and sends nothing.
- Works with Vendure 2 and 3.
