// One door to Resend for the API routes.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type ResendAttachment = {
  filename: string;
  /** The file's bytes, base64. */
  content: string;
  contentType?: string;
};

export type ResendMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  attachments?: ResendAttachment[];
};

export type ResendResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendWithResend(message: ResendMessage): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'Email service is not configured. Set RESEND_API_KEY on the server.' };
  const from = process.env.BETA_EMAIL_FROM || 'Poplur <hello@poplur.ca>';
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.attachments && message.attachments.length
        ? { attachments: message.attachments.map(a => ({ filename: a.filename, content: a.content, ...(a.contentType ? { content_type: a.contentType } : {}) })) }
        : {}),
    }),
  });
  if (!response.ok) {
    let providerError = 'Email provider rejected the message.';
    try {
      const result = (await response.json()) as { message?: string; error?: string };
      providerError = result.message || result.error || providerError;
    } catch {
      // Keep the generic provider error.
    }
    return { ok: false, error: providerError };
  }
  const result = (await response.json()) as { id?: string };
  return { ok: true, id: result.id ?? null };
}

/** poplur.ca has no MX record, so a reply to hello@poplur.ca bounces; until
 *  it can receive, BETA_EMAIL_REPLY_TO names the inbox replies should reach. */
export function replyToAddress(): string | null {
  return process.env.BETA_EMAIL_REPLY_TO || null;
}
