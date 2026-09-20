import {
  BETA_INVITE_IMAGES,
  betaInviteFrom,
  betaInviteSubject,
  createBetaInviteHtml,
  createBetaInviteText,
  pickBetaInviteVariant,
  type BetaInviteImageKey,
} from '@/emails/betaInviteEmail';

declare const require: any;

const { readFile } = require('node:fs/promises');
const path = require('node:path');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { attachments, images } = await loadInlineImages();
  // One of the four designs per email, rolled here so the answer knows which.
  const variant = pickBetaInviteVariant();

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(attachments.length ? { attachments } : {}),
      from,
      to: email,
      subject: betaInviteSubject,
      html: createBetaInviteHtml({ images, variant }),
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

  return Response.json({ id: result.id ?? null, ok: true, variant });
}

// The email's pictures ride along as inline parts, one per content id, so
// they show without a "load images" click and without a hosted URL that a
// bundle hash could move. A file the function bundle does not carry (see
// vercel.json includeFiles) is simply left out of the mail rather than
// failing the send.
async function loadInlineImages() {
  const attachments: { content: string; contentId: string; filename: string }[] = [];
  const images: Partial<Record<BetaInviteImageKey, string>> = {};
  for (const key of Object.keys(BETA_INVITE_IMAGES) as BetaInviteImageKey[]) {
    const image = BETA_INVITE_IMAGES[key];
    try {
      const content = await readFile(path.join(process.cwd(), image.file));
      attachments.push({ content: content.toString('base64'), contentId: image.contentId, filename: image.filename });
      images[key] = `cid:${image.contentId}`;
    } catch {
      images[key] = '';
    }
  }
  return { attachments, images };
}
