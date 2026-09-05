/** Owner-authorized social testing. These identities are explicit, never
 * inferred from whoever happens to be nearby in the production feed. */
export const LIVE_OWNER_UID = 'eoP2Z0ElxIa0Eua7xpFxNlr6tur1';
export const LIVE_CALL_INTERVAL_MS = 5 * 60_000;
export const LIVE_MAX_CALLS_PER_ACTOR = 2;
export const LIVE_CALL_RING_MS = 25_000;
export const LIVE_CALL_CONNECTED_MS = 45_000;
const prefix = 'projects/poplur2025/databases/(default)/documents/';
const scalar = value => value?.stringValue ?? value?.booleanValue ?? value?.integerValue ?? value?.doubleValue;
const keysOnly = (object, keys) => object && Object.keys(object).every(key => keys.includes(key));
const time = (transform, path) => transform?.fieldPath === path && transform.setToServerValue === 'REQUEST_TIME' && Object.keys(transform).length === 2;

/** Only the actor's own outgoing rendezvous with the consenting owner,
 * its offer/ICE, and its cleanup. No incoming call may be auto-answered. */
export function inspectSocialCallWrite(write, state) {
  const name = write?.update?.name || write?.delete;
  if (typeof name !== 'string' || !name.startsWith(`${prefix}calls/`)) return null;
  const path = name.slice(prefix.length);
  const match = /^calls\/([A-Za-z0-9_-]{6,128})(?:\/candidates\/([A-Za-z0-9_-]{6,128}))?$/.exec(path);
  if (!match) return false;
  const id = match[1];
  const known = state.callIds.has(id);
  if (write.delete) return known && Object.keys(write).every(key => ['delete', 'currentDocument'].includes(key));
  if (!keysOnly(write, ['update', 'updateMask', 'updateTransforms', 'currentDocument'])
    || !keysOnly(write.update, ['name', 'fields'])) return false;
  const fields = write.update.fields;
  if (!fields || typeof fields !== 'object') return false;
  const transforms = write.updateTransforms || [];
  const mask = write.updateMask?.fieldPaths?.map(path => path.replace(/`/g, '')) || [];
  if (match[2]) {
    return known && keysOnly(fields, ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment', 'senderId'])
      && scalar(fields.senderId) === state.uid
      && typeof scalar(fields.candidate) === 'string' && scalar(fields.candidate).length <= 4096
      && transforms.length === 1 && time(transforms[0], 'createdAt') && mask.length === 0;
  }
  if ('participants' in fields) {
    const participants = fields.participants?.arrayValue?.values?.map(scalar);
    const ok = state.callRecipient === LIVE_OWNER_UID
      && (known || state.callIds.size < LIVE_MAX_CALLS_PER_ACTOR)
      && Object.keys(fields).length === 7
      && keysOnly(fields, ['participants', 'callerId', 'callerName', 'calleeId', 'status', 'video', 'provider'])
      && Array.isArray(participants) && participants.length === 2
      && participants.join('|') === [state.uid, LIVE_OWNER_UID].sort().join('|')
      && scalar(fields.callerId) === state.uid && scalar(fields.calleeId) === LIVE_OWNER_UID
      && typeof scalar(fields.callerName) === 'string' && scalar(fields.callerName).length <= 120
      && scalar(fields.status) === 'ringing' && scalar(fields.provider) === 'webrtc'
      && typeof scalar(fields.video) === 'boolean'
      && transforms.length === 1 && time(transforms[0], 'createdAt') && !write.updateMask;
    if (ok) state.callIds.add(id);
    return ok;
  }
  if (!known || transforms.length) return false;
  if (Object.keys(fields).length === 1 && fields.status) {
    return scalar(fields.status) === 'ended' && mask.length === 1 && mask[0] === 'status';
  }
  const offer = fields.offer?.mapValue?.fields;
  return Object.keys(fields).length === 1 && offer && Object.keys(offer).length === 2
    && scalar(offer.type) === 'offer' && typeof scalar(offer.sdp) === 'string'
    && scalar(offer.sdp).length > 0 && scalar(offer.sdp).length <= 100_000
    && mask.length > 0 && mask.every(path => ['offer', 'offer.type', 'offer.sdp'].includes(path));
}

/** Read receipts and typing may touch only the actor's key in an already
 * bound thread. The runner never changes the owner's unread/read state. */
export function isSocialThreadStateWrite(write, state, fields) {
  const unquote = path => path.replace(/`/g, '');
  const mask = write.updateMask?.fieldPaths?.map(unquote) || [];
  const transforms = write.updateTransforms || [];
  if (!keysOnly(fields, ['readAtBy', 'unreadBy', 'typingBy'])) return false;
  for (const [key, value] of Object.entries(fields)) {
    const children = value?.mapValue?.fields;
    if (!children || !Object.keys(children).every(uid => uid === state.uid)) return false;
    if (key === 'unreadBy' && Object.keys(children).some(uid => Number(scalar(children[uid])) !== 0)) return false;
    if (key !== 'unreadBy' && Object.keys(children).length) return false;
  }
  return (mask.length + transforms.length > 0)
    && mask.every(path => ['typingBy', 'readAtBy', 'unreadBy'].some(key => path === `${key}.${state.uid}`))
    && transforms.every(transform => ['typingBy', 'readAtBy'].some(key => time({ ...transform, fieldPath: unquote(transform.fieldPath) }, `${key}.${state.uid}`)));
}
