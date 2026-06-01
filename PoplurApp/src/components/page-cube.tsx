import { PanResponder, StyleSheet, Text, View } from 'react-native';

type PageCubeProps = {
  currentPage: number;
  currentSection: number;
  onSwipePage: (page: number) => void;
  onSwipeSection: (section: number) => void;
  pageLabels: string[];
  triggerCount?: number;
  pageProgress?: number;
};

export function PageCube({
  currentPage,
  currentSection,
  onSwipePage,
  onSwipeSection,
  pageLabels,
}: PageCubeProps) {
  const page = Number.isFinite(currentPage) ? currentPage : 0;
  const section = Number.isFinite(currentSection) ? currentSection : 0;

  const responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > 8 || Math.abs(dy) > 8,
    onPanResponderRelease: (_, { dx, dy }) => {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const THRESHOLD = 44;

      if (absDx >= absDy && absDx > THRESHOLD) {
        // Horizontal: navigate pages
        const next = dx < 0 ? Math.min(1, page + 1) : Math.max(0, page - 1);
        if (next !== page) {
          onSwipePage(next);
          onSwipeSection(0); // reset section when changing page
        }
      } else if (absDy > absDx && absDy > THRESHOLD) {
        // Vertical: navigate sections (swipe up → section 1 About, swipe down → section 0 Home)
        const next = dy < 0 ? Math.min(1, section + 1) : Math.max(0, section - 1);
        if (next !== section) onSwipeSection(next);
      }
    },
  });

  // Show the label for the active destination
  const label = section === 1 ? (pageLabels[2] ?? 'About') : (pageLabels[page] ?? '');

  return (
    <View style={styles.container} {...responder.panHandlers}>
      <View style={styles.cubeFace}>
        <Text style={styles.cubeText}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 118,
    height: 118,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cubeFace: {
    width: 108,
    height: 108,
    borderRadius: 34,
    backgroundColor: '#4a0a3b',
    borderColor: '#ff49b6',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff1797',
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
  },
  cubeText: {
    color: '#fff7fb',
    fontSize: 20,
    fontFamily: 'Arial Rounded MT Bold',
    fontWeight: '900',
    textShadowColor: '#ff1797',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
