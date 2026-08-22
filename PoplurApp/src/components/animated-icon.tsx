import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const INITIAL_SCALE_FACTOR = Dimensions.get('screen').height / 90;
const DURATION = 600;

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: INITIAL_SCALE_FACTOR }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  return (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.backgroundSolidColor}
    />
  );
}

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 0.35 }, { rotateZ: '-8deg' }],
    opacity: 0,
  },
  45: {
    transform: [{ scale: 1.28 }, { rotateZ: '4deg' }],
    opacity: 1,
    easing: Easing.elastic(0.7),
  },
  70: {
    transform: [{ scale: 0.92 }, { rotateZ: '-1deg' }],
    opacity: 1,
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }, { rotateZ: '0deg' }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon({ active = true }: { active?: boolean; triggerCount?: number }) {
  return (
    <View style={styles.iconContainer}>
      {active ? (
        <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
          <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
        </Animated.View>
      ) : (
        <View style={[styles.glow, styles.glowInactive]}>
          <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
        </View>
      )}

      {active ? (
        <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
          <Image
            contentFit="cover"
            style={styles.image}
            source={require('@/assets/images/welcome-logo.png')}
          />
        </Animated.View>
      ) : (
        <View style={styles.imageContainer}>
          <Image
            contentFit="cover"
            style={styles.image}
            source={require('@/assets/images/welcome-logo.png')}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  glowInactive: {
    opacity: 0.55,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  backgroundSolidColor: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#E63946',
    zIndex: 1000,
  },
});
