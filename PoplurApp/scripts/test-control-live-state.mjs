export const emptyPublicSnapshot = () => ({ posts: [], cells: [], feed: [] });

/** Small state holder that makes stale-green reconnects impossible. */
export function createLiveDashboardState() {
  let cachedDashboard = null;
  let publicSnapshot = emptyPublicSnapshot();
  let publicReady = false;
  return {
    reset() {
      cachedDashboard = null;
      publicSnapshot = emptyPublicSnapshot();
      publicReady = false;
    },
    acceptPublic(snapshot) {
      publicSnapshot = snapshot;
      publicReady = true;
    },
    isPublicReady() { return publicReady; },
    combine(privateDashboard) {
      if (!publicReady) return null;
      return {
        ...privateDashboard,
        publicPosts: publicSnapshot.posts,
        publicMap: publicSnapshot.cells,
        publicFeed: publicSnapshot.feed,
      };
    },
    cache(dashboard) { cachedDashboard = dashboard; },
    cached() { return cachedDashboard; },
  };
}
