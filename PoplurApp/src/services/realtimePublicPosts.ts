import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  aggregateRealtimePublicPosts,
  applyRealtimeRadiusBaselines,
  normalizeRealtimePublicSnapshot,
} from './realtimePublicPostPolicy';
import type { RealtimePublicPostSnapshot } from './realtimePublicPostPolicy';

export {
  aggregateRealtimePublicPosts,
  applyRealtimeRadiusBaselines,
  coarsePublicPostRegion,
  normalizeRealtimePublicPost,
  normalizeRealtimePublicSnapshot,
} from './realtimePublicPostPolicy';
export type {
  RealtimePublicPost,
  RealtimePublicPostSnapshot,
} from './realtimePublicPostPolicy';

const REALTIME_POST_LIMIT = 160;

/** Firestore's first snapshot and every add/change/delete replace this state. */
export function subscribeRealtimePublicPosts(
  listener: (snapshot: RealtimePublicPostSnapshot) => void,
  onError: (error: Error) => void = () => {},
): Unsubscribe {
  const radiusBaselines = new Map<string, number>();
  const posts = query(
    collection(db, 'posts'),
    orderBy('createdAt', 'desc'),
    limit(REALTIME_POST_LIMIT),
  );
  return onSnapshot(posts, snapshot => {
    const normalized = normalizeRealtimePublicSnapshot(
      snapshot.docs.map(document => ({ id: document.id, data: document.data() })),
    );
    const livePosts = applyRealtimeRadiusBaselines(normalized.posts, radiusBaselines);
    listener({ posts: livePosts, cells: aggregateRealtimePublicPosts(livePosts) });
  }, error => {
    radiusBaselines.clear();
    listener({ posts: [], cells: [] });
    onError(error instanceof Error ? error : new Error('Realtime public posts are unavailable.'));
  });
}
