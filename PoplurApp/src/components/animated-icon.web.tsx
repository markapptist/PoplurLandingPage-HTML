import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { usePoplurPerformance } from '@/performance/usePoplurPerformance';

type AnimatedIconProps = {
  active?: boolean;
  triggerCount?: number;
};

export function AnimatedSplashOverlay() {
  return null;
}

export function AnimatedIcon({ active = true, triggerCount = 0 }: AnimatedIconProps) {
  const performancePolicy = usePoplurPerformance();
  // ── Entry animation (shared values, controlled via useEffect so they fire
  //    exactly once on mount and are never reset by re-renders) ──
  const entryOpacity = useSharedValue(0);
  const entryScale = useSharedValue(0.3);
  const entryRotate = useSharedValue(-10);

  // ── Pop animation (triggered by clicks via triggerCount) ──
  const popScale = useSharedValue(1);

  // ── Glow rotation ──
  const glowOpacity = useSharedValue(0);
  const glowRotate = useSharedValue(0);

  // Entrance — runs once on mount
  useEffect(() => {
    const D = 650;
    entryOpacity.value = withTiming(1, { duration: 220 });
    entryScale.value = withSequence(
      withTiming(1.32, { duration: D * 0.42, easing: Easing.elastic(1.2) }),
      withTiming(0.92, { duration: D * 0.26 }),
      withSpring(1, { damping: 9, stiffness: 200 }),
    );
    entryRotate.value = withSequence(
      withTiming(5, { duration: D * 0.42 }),
      withTiming(-1, { duration: D * 0.26 }),
      withSpring(0, { damping: 9, stiffness: 200 }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps — exactly one run

  useEffect(() => {
    cancelAnimation(glowRotate);
    const shouldAnimate =
      active &&
      performancePolicy.isForeground &&
      performancePolicy.decorativeRenderingAllowed;
    glowOpacity.value = withTiming(shouldAnimate ? 1 : 0.55, { duration: 240 });
    if (shouldAnimate) {
      glowRotate.value = withRepeat(
        withTiming(360, { duration: 9000, easing: Easing.linear }),
        -1,
        false,
      );
    }
    return () => cancelAnimation(glowRotate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, performancePolicy.decorativeRenderingAllowed, performancePolicy.isForeground]);

  // Pop on click
  useEffect(() => {
    if (triggerCount > 0 && active && performancePolicy.isForeground) {
      popScale.value = withSequence(
        withTiming(1.18, { duration: 80, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 8, stiffness: 220 }),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, performancePolicy.isForeground, triggerCount]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ rotateZ: `${glowRotate.value}deg` }],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: entryOpacity.value,
    transform: [
      { scale: entryScale.value },
      { rotateZ: `${entryRotate.value}deg` },
    ],
  }));

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popScale.value }],
  }));

  return (
    // Outer wrapper handles the pop scale — kept separate so it never
    // interferes with the entry opacity/transform
    <Animated.View style={popStyle}>
      <Animated.View style={[styles.iconContainer, logoStyle]}>
        <Animated.View style={[styles.glow, glowStyle]}>
          <Image style={styles.glowImage} source={require('@/assets/images/logo-glow.png')} />
        </Animated.View>
        <Animated.View style={styles.imageContainer}>
          <Image
            contentFit="cover"
            style={styles.image}
            source={require('@/assets/images/logo3.png')}
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 40,
    width: 128,
    height: 128,
    overflow: 'hidden',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowImage: {
    width: 201,
    height: 201,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
