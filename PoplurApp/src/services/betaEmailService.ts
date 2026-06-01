type SendBetaInviteResult = {
  id?: string | null;
  ok: boolean;
};

export async function sendBetaInviteEmail(email: string): Promise<SendBetaInviteResult> {
  const response = await fetch('/api/send-beta-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
    id?: string | null;
    ok?: boolean;
  };

  if (!response.ok) {
    throw new Error(result.error || 'Unable to send beta links right now.');
  }

  return { id: result.id ?? null, ok: result.ok === true };
}
