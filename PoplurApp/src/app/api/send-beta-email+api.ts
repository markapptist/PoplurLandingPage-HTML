import {
  betaInviteFrom,
  betaInviteSubject,
  createBetaInviteHtml,
  createBetaInviteText,
} from '@/emails/betaInviteEmail';

declare const require: any;

const { readFile } = require('node:fs/promises');
const path = require('node:path');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_CONTENT_ID = 'poplur-logo';

type SendEmailRequest = {
  email?: unknown;
};

export async function POST(request: Request) {
  let body: SendEmailRequest;

  try {
    body = (await request.json()) as SendEmailRequest;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!EMAIL_PATTERN.test(email)) {
    return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BETA_EMAIL_FROM || betaInviteFrom;

  if (!apiKey) {
    return Response.json(
      { error: 'Email service is not configured. Set RESEND_API_KEY on the server.' },
      { status: 503 },
    );
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      attachments: [
        {
          content: await getLogoContent(),
          contentId: LOGO_CONTENT_ID,
          filename: 'logo3.png',
        },
      ],
      from,
      to: email,
      subject: betaInviteSubject,
      html: createBetaInviteHtml({ logoSrc: `cid:${LOGO_CONTENT_ID}` }),
      text: createBetaInviteText(),
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

    return Response.json({ error: providerError }, { status: 502 });
  }

  const result = (await response.json()) as { id?: string };

  return Response.json({ id: result.id ?? null, ok: true });
}

async function getLogoContent() {
  const logoPath = path.join(process.cwd(), 'assets/images/logo3.png');
  const logo = await readFile(logoPath);

  return logo.toString('base64');
}
