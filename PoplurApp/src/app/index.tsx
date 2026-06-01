import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { PageCube } from '@/components/page-cube';
import { ParticleBurst } from '@/components/particle-burst';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { sendBetaInviteEmail } from '@/services/betaEmailService';
import { saveBetaSignupEmail } from '@/services/betaSignupService';

// [0]=Home, [1]=Beta/Signup, [2]=About (cube bottom face)
const PAGE_LABELS = ['Home', 'Beta', 'About'];
const HORIZONTAL_PAGE_LABELS = ['Home', 'Join'];

const CUBE_HEIGHT = 118;
const CUBE_BOTTOM = Spacing.five;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BACKGROUND_VIDEO_SOURCE = require('@/assets/videos/poplur-users-app-background.mp4');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EXPLAINER_VIDEO_SOURCE = require('@/assets/videos/poplr-explainer-narrated.mp4');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EXPLAINER_NARRATION_SOURCE = require('@/assets/videos/poplr-explainer-narration.wav');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LOGO_SOURCE = require('@/assets/images/logo3.png');

export default function HomeScreen() {
  const { height, width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [activePage, setActivePage] = useState(0);        // horizontal: 0=Home 1=Beta
  const [pageProgress, setPageProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState(0); // vertical: 0=Logo 1=About
  const [popCount, setPopCount] = useState(0);
  const [hintMessageIndex, setHintMessageIndex] = useState(0);
  const hScrollRef = useRef<ScrollView>(null);    // outer horizontal pager
  const homeScrollRef = useRef<ScrollView>(null); // home page inner vertical scroll
  const activePageRef = useRef(0);
  const currentSectionRef = useRef(0);
  const hasInteractedRef = useRef(Platform.OS !== 'web');
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const hintMotion = useRef(new Animated.Value(0)).current;
  const hintTextOpacity = useRef(new Animated.Value(1)).current;
  const backgroundPlayer = useVideoPlayer(BACKGROUND_VIDEO_SOURCE, (player) => {
    player.loop = true;
    player.muted = Platform.OS === 'web';
    player.play();
  });
  const explainerPlayer = useVideoPlayer(EXPLAINER_VIDEO_SOURCE, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  useEffect(() => {
    backgroundPlayer.loop = true;
    backgroundPlayer.muted = Platform.OS === 'web';
    backgroundPlayer.play();
  }, [backgroundPlayer]);

  useEffect(() => {
    explainerPlayer.loop = true;
    explainerPlayer.muted = true;
    explainerPlayer.play();
  }, [explainerPlayer]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const audio = document.createElement('audio');
    audio.src = EXPLAINER_NARRATION_SOURCE;
    audio.preload = 'auto';
    audio.volume = 1;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    narrationAudioRef.current = audio;
    (window as any).__poplurNarrationAudio = audio;
    return () => {
      audio.pause();
      audio.currentTime = 0;
      audio.remove();
      narrationAudioRef.current = null;
      delete (window as any).__poplurNarrationAudio;
    };
  }, []);

  useEffect(() => {
    currentSectionRef.current = currentSection;
    const isExplainerVisible = activePage === 0 && currentSection === 1;
    if (isExplainerVisible) {
      restartExplainer(hasInteractedRef.current);
      if (Platform.OS === 'web') {
        let attempts = 0;
        const retry = window.setInterval(() => {
          attempts += 1;
          if (activePageRef.current === 0 && currentSectionRef.current === 1) {
            playExplainerElement(false, attempts === 1);
            if (hasInteractedRef.current) playNarrationAudio(attempts === 1);
          }
          if (attempts >= 8) window.clearInterval(retry);
        }, 260);
        return () => window.clearInterval(retry);
      }
    } else {
      stopExplainer();
    }
  }, [activePage, currentSection, explainerPlayer]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const interval = window.setInterval(() => {
      const video = getExplainerElement();
      if (!video) return;
      video.muted = true;
      video.defaultMuted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('autoplay', '');
      video.setAttribute('playsinline', '');
      video.loop = true;
      if (video.paused) video.play().catch(() => {});
    }, 450);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function enableBackgroundMusic() {
      hasInteractedRef.current = true;
      backgroundPlayer.muted = true;
      backgroundPlayer.play();
      primeNarrationAudio();
      if (activePage === 0 && currentSection === 1) {
        restartExplainer(true);
      }
    }
    window.addEventListener('pointerdown', enableBackgroundMusic, { once: true });
    window.addEventListener('wheel', enableBackgroundMusic, { once: true });
    window.addEventListener('keydown', enableBackgroundMusic, { once: true });
    return () => {
      window.removeEventListener('pointerdown', enableBackgroundMusic);
      window.removeEventListener('wheel', enableBackgroundMusic);
      window.removeEventListener('keydown', enableBackgroundMusic);
    };
  }, [activePage, backgroundPlayer, currentSection, explainerPlayer]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let pointerStartY = 0;

    function unlockExplainerFromGesture() {
      if (activePageRef.current !== 0) return;
      hasInteractedRef.current = true;
      playExplainerElement(false, true);
      playNarrationAudio(true);
      explainerPlayer.muted = true;
      explainerPlayer.play();
    }

    function handleWheel(event: WheelEvent) {
      if (event.deltaY > 8) unlockExplainerFromGesture();
    }

    function handlePointerDown(event: PointerEvent) {
      pointerStartY = event.clientY;
      if (activePageRef.current === 0 && currentSectionRef.current === 1) unlockExplainerFromGesture();
    }

    function handlePointerMove(event: PointerEvent) {
      if (pointerStartY - event.clientY > 24) unlockExplainerFromGesture();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
        unlockExplainerFromGesture();
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', unlockExplainerFromGesture, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('touchmove', unlockExplainerFromGesture);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [explainerPlayer]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hintMotion, {
          duration: 900,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(hintMotion, {
          duration: 900,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hintMotion]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      Animated.timing(hintTextOpacity, {
        duration: 220,
        toValue: 0,
        useNativeDriver: true,
      }).start(() => {
        setHintMessageIndex((index) => (index + 1) % 2);
        Animated.timing(hintTextOpacity, {
          duration: 320,
          toValue: 1,
          useNativeDriver: true,
        }).start();
      });
    }, 2400);
    return () => window.clearInterval(interval);
  }, [hintTextOpacity]);

  useEffect(() => {
    const pop = () => setPopCount((count) => count + 1);
    const launchTimer = setTimeout(pop, 720);
    const interval = setInterval(pop, 4200);
    return () => {
      clearTimeout(launchTimer);
      clearInterval(interval);
    };
  }, []);

  const pageSize   = Math.max(width, 1);
  const pageHeight = Math.max(height, 1);

  // Web-specific styles
  const webHScrollStyle =
    Platform.OS === 'web'
      ? ({ scrollSnapType: 'x mandatory', height: '100vh', overflowY: 'hidden' } as any)
      : undefined;

  const webHomePageStyle =
    Platform.OS === 'web'
      ? ({ scrollSnapAlign: 'start', width: '100vw', height: '100vh',
           overflowY: 'auto', scrollSnapType: 'y mandatory' } as any)
      : undefined;

  const webBetaPageStyle =
    Platform.OS === 'web'
      ? ({ scrollSnapAlign: 'start', width: '100vw', height: '100vh', overflowY: 'auto' } as any)
      : undefined;

  const webVertSectionSnap =
    Platform.OS === 'web' ? ({ scrollSnapAlign: 'start' } as any) : undefined;

  const scrollContentSize =
    Platform.OS === 'web' ? ({ minWidth: '200vw' } as any) : { minWidth: pageSize * 2 };

  const sectionSize =
    Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : { minHeight: pageHeight };

  const normalizedEmail = email.trim();
  const canSubmit = normalizedEmail.length > 0;
  const isCompact = width < 640;

  // Web: every click → pop.mp3 + animation trigger
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let audio: HTMLAudioElement | null = null;
    function getAudio(): HTMLAudioElement | null {
      if (!audio) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const src = require('@/assets/pop.mp3') as string;
          audio = new (window as any).Audio(src);
          (audio as HTMLAudioElement).preload = 'auto';
        } catch { /* audio not available */ }
      }
      return audio;
    }
    function handleClick() {
      const a = getAudio();
      if (a) { a.currentTime = 0; a.play().catch(() => {}); }
      setPopCount((c) => c + 1);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  function restartExplainer(withSound: boolean) {
    explainerPlayer.loop = true;
    explainerPlayer.currentTime = 0;
    if (Platform.OS === 'web') {
      explainerPlayer.muted = true;
      explainerPlayer.play();
      playExplainerElement(false);
      if (withSound) playNarrationAudio(true);
      if (withSound) {
        window.setTimeout(() => {
          explainerPlayer.muted = true;
          explainerPlayer.play();
          playExplainerElement(false, false);
          playNarrationAudio(false);
        }, 80);
      }
      return;
    }
    explainerPlayer.muted = !withSound;
    explainerPlayer.play();
  }

  function stopExplainer() {
    explainerPlayer.loop = true;
    explainerPlayer.muted = true;
    explainerPlayer.play();
    if (Platform.OS === 'web') {
      const video = getExplainerElement();
      if (video) {
        video.muted = true;
        video.loop = true;
        video.play().catch(() => {});
      }
      const audio = narrationAudioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
  }

  function getExplainerElement() {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
    return Array.from(document.querySelectorAll('video')).find((video) =>
      (video.currentSrc || video.src).includes('poplr-explainer-narrated'),
    ) ?? null;
  }

  function isExplainerElementVisible(video: HTMLVideoElement) {
    const style = window.getComputedStyle(video);
    const rect = video.getBoundingClientRect();
    return Number(style.opacity) > 0.5 && rect.width > 0 && rect.height > 0;
  }

  function playExplainerElement(withSound: boolean, reset = true) {
    const video = getExplainerElement();
    if (!video) return;
    if (reset) video.currentTime = 0;
    video.volume = 1;
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }

  function getNarrationAudio() {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    if (!narrationAudioRef.current && typeof document !== 'undefined') {
      const audio = document.createElement('audio');
      audio.src = EXPLAINER_NARRATION_SOURCE;
      audio.preload = 'auto';
      audio.volume = 1;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      narrationAudioRef.current = audio;
      (window as any).__poplurNarrationAudio = audio;
    }
    return narrationAudioRef.current;
  }

  function primeNarrationAudio() {
    const audio = getNarrationAudio();
    if (!audio) return;
    audio.muted = true;
    audio.currentTime = 0;
    audio.play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      })
      .catch(() => {
        audio.muted = false;
      });
  }

  function playNarrationAudio(reset = true) {
    const audio = getNarrationAudio();
    if (!audio) return;
    if (reset) audio.currentTime = 0;
    audio.muted = false;
    audio.volume = 1;
    audio.play().catch(() => {});
  }

  function updateActivePage(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetX = event.nativeEvent.contentOffset.x;
    if (!Number.isFinite(offsetX)) return;
    const vw =
      event.nativeEvent.layoutMeasurement.width ||
      (Platform.OS === 'web' ? window.innerWidth : pageSize);
    const progress = vw > 0 ? Math.max(0, Math.min(1, offsetX / vw)) : 0;
    const next = Math.max(0, Math.min(1, Math.round(offsetX / vw)));
    setPageProgress(progress);
    if (activePageRef.current !== next) {
      activePageRef.current = next;
      setActivePage(next);
      if (next !== 0) {
        currentSectionRef.current = 0;
        setCurrentSection(0);
        homeScrollRef.current?.scrollTo({ y: 0, animated: false });
      }
    }
  }

  function scrollToPage(page: number) {
    const p = Math.max(0, Math.min(1, page));
    activePageRef.current = p;
    setActivePage(p);
    setPageProgress(p);
    // Navigating away from home → reset vertical section
    if (p !== 0) {
      currentSectionRef.current = 0;
      setCurrentSection(0);
      homeScrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    if (Platform.OS === 'web') {
      const node = (hScrollRef.current as any)?.getScrollableNode?.();
      const vw = window.innerWidth || pageSize;
      if (node) {
        const prev = node.style.scrollSnapType;
        node.style.scrollSnapType = 'none';
        node.scrollLeft = vw * p;
        requestAnimationFrame(() => { node.style.scrollSnapType = prev; });
        return;
      }
    }
    hScrollRef.current?.scrollTo({ x: pageSize * p, animated: true });
  }

  function scrollToSection(section: number) {
    const s = Math.max(0, Math.min(1, section));
    currentSectionRef.current = s;
    setCurrentSection(s);
    if (s === 1) {
      hasInteractedRef.current = true;
      restartExplainer(true);
    } else {
      stopExplainer();
    }
    if (Platform.OS === 'web') {
      const node = (homeScrollRef.current as any)?.getScrollableNode?.();
      const vh = window.innerHeight || pageHeight;
      if (node) { node.scrollTo({ top: s * vh, behavior: 'smooth' }); return; }
    }
    homeScrollRef.current?.scrollTo({ y: s * pageHeight, animated: true });
  }

  function startExplainerNarrationGesture() {
    if (Platform.OS !== 'web' || activePageRef.current !== 0) return;
    hasInteractedRef.current = true;
    primeNarrationAudio();
    window.setTimeout(() => {
      if (activePageRef.current === 0 && currentSectionRef.current === 1) {
        playNarrationAudio(true);
      }
    }, 140);
  }

  function handleHomeVertScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    const h = event.nativeEvent.layoutMeasurement.height || pageHeight;
    if (h > 0) {
      const nextSection = y > h * 0.18 ? 1 : 0;
      if (nextSection !== currentSection) {
        currentSectionRef.current = nextSection;
        setCurrentSection(nextSection);
        if (nextSection === 1) {
          hasInteractedRef.current = true;
          restartExplainer(true);
        } else {
          stopExplainer();
        }
      }
    }
  }

  async function submitBetaSignup() {
    if (isSubmittingEmail) return;

    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!ok) { setSubmitted(false); setEmailError('Enter a valid email address.'); return; }

    setEmailError('');
    setIsSubmittingEmail(true);

    try {
      await saveBetaSignupEmail(normalizedEmail);
      await sendBetaInviteEmail(normalizedEmail);
      setSubmitted(true);
    } catch (error) {
      setSubmitted(false);
      setEmailError(error instanceof Error ? error.message : 'Unable to send beta links right now.');
    } finally {
      setIsSubmittingEmail(false);
    }
  }

  function openEmailPreview() {
    if (Platform.OS === 'web') {
      window.location.href = '/email-preview';
    }
  }

  const sideDotCount = activePage === 0 ? 2 : 1;
  const clampedPageProgress = Math.max(0, Math.min(1, pageProgress));
  const hintOpacity = hintMotion.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.72, 1, 0.72],
  });
  const hintLift = hintMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });
  const leftArrowShift = hintMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [4, -4],
  });
  const downArrowShift = hintMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [-3, 5],
  });
  const currentHint =
    hintMessageIndex === 0
      ? { arrow: '→', text: 'Swipe right to join', transform: [{ translateX: leftArrowShift }] }
      : { arrow: '↓', text: 'Swipe down to learn about', transform: [{ translateY: downArrowShift }] };
  const isHomeLogoPage = activePage === 0 && currentSection === 0;

  return (
    <ThemedView style={styles.container}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <VideoView
          contentFit="cover"
          nativeControls={false}
          player={backgroundPlayer}
          playsInline
          style={[
            styles.backgroundVideo,
            activePage === 0 && currentSection === 1
              ? styles.backgroundVideoHidden
              : styles.backgroundVideoVisible,
          ]}
          surfaceType="textureView"
          useExoShutter={false}
        />
        <VideoView
          contentFit="cover"
          nativeControls={false}
          player={explainerPlayer}
          playsInline
          style={[
            styles.backgroundVideo,
            activePage === 0 && currentSection === 1
              ? styles.backgroundVideoVisible
              : styles.backgroundVideoHidden,
          ]}
          surfaceType="textureView"
          useExoShutter={false}
        />
        <View style={styles.backgroundOverlay} />
      </View>
      <ParticleBurst active={isHomeLogoPage} triggerCount={popCount} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topPagination}>
          <View style={styles.topPaginationTrack}>
            <View
              pointerEvents="none"
              style={[
                styles.topPaginationIndicator,
                { left: `${clampedPageProgress * 50}%` as any },
              ]}
            />
            {HORIZONTAL_PAGE_LABELS.map((label, index) => {
              const isActive = activePage === index;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  key={label}
                  onPress={() => scrollToPage(index)}
                  style={({ pressed }) => [
                    styles.topPaginationItem,
                    pressed && styles.topPaginationItemPressed,
                  ]}
                >
                  <View style={[styles.topPaginationDot, isActive && styles.topPaginationDotActive]} />
                  <ThemedText
                    style={[
                      styles.topPaginationText,
                      isActive && styles.topPaginationTextActive,
                    ]}
                  >
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {Platform.OS !== 'web' && (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.bottomPagination}
          >
            <View style={[styles.dot, activePage === 0 && styles.dotActive]} />
            <View style={[styles.dot, activePage === 1 && styles.dotActive]} />
          </View>
        )}

        {/* Side pagination — vertical sections */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.sidePagination}
        >
          {Array.from({ length: sideDotCount }).map((_, i) => (
            <View key={i} style={[styles.dot, currentSection === i && styles.dotActive]} />
          ))}
        </View>

        {/* ── Horizontal page scroller ── */}
        <ScrollView
          ref={hScrollRef}
          horizontal
          style={[styles.scrollView, webHScrollStyle]}
          contentContainerStyle={[styles.scrollContent, scrollContentSize]}
          showsHorizontalScrollIndicator={false}
          pagingEnabled
          snapToInterval={pageSize}
          decelerationRate="fast"
          onMomentumScrollEnd={updateActivePage}
          onScroll={updateActivePage}
          scrollEventThrottle={16}
        >
          {/* ═══ Slide 1: Home — two vertical sections ═══ */}
          <ScrollView
            ref={homeScrollRef}
            style={[styles.pageScroll, webHomePageStyle]}
            contentContainerStyle={styles.pageContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            snapToInterval={Platform.OS !== 'web' ? pageHeight : undefined}
            decelerationRate={Platform.OS !== 'web' ? 'fast' : undefined}
            onScrollBeginDrag={startExplainerNarrationGesture}
            onScroll={handleHomeVertScroll}
            scrollEventThrottle={16}
          >
            {/* Section 0 — Logo hero */}
            <View style={[styles.logoSlide, sectionSize, webVertSectionSnap]}>
              <View style={styles.logoArea}>
                <AnimatedIcon triggerCount={popCount} />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.heroSwipeHints,
                    {
                      opacity: hintOpacity,
                      transform: [{ translateY: hintLift }],
                    },
                  ]}
                >
                  <Animated.View style={[styles.heroHintRow, { opacity: hintTextOpacity }]}>
                    <ThemedText style={styles.heroHintText}>{currentHint.text}</ThemedText>
                    <Animated.View
                      style={[styles.heroHintArrow, { transform: currentHint.transform }]}
                    >
                      <ThemedText style={styles.heroHintArrowText}>{currentHint.arrow}</ThemedText>
                    </Animated.View>
                  </Animated.View>
                </Animated.View>
              </View>
              {Platform.OS !== 'web' && (
                <View style={styles.cubeArea}>
                  <PageCube
                    currentPage={activePage}
                    currentSection={currentSection}
                    onSwipePage={scrollToPage}
                    onSwipeSection={scrollToSection}
                    pageLabels={PAGE_LABELS}
                    triggerCount={popCount}
                  />
                </View>
              )}
            </View>

            {/* Section 1 — Explainer background */}
            <View style={[styles.explainerSlide, sectionSize, webVertSectionSnap]}>
            </View>
          </ScrollView>

          {/* ═══ Slide 2: Beta signup ═══ */}
          <ScrollView
            style={[styles.pageScroll, webBetaPageStyle]}
            contentContainerStyle={styles.pageContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEventThrottle={16}
          >
            <View style={[styles.signupSlide, sectionSize]}>
              <View pointerEvents="none" style={styles.signupBrandWash} />
              <View style={styles.signupContent}>
                <View style={styles.signupMark}>
                  <Image contentFit="cover" source={LOGO_SOURCE} style={styles.signupMarkImage} />
                </View>
                <ThemedText type="title" style={styles.signupTitle}>
                  Join the Poplur beta
                </ThemedText>
                <ThemedText style={styles.signupText}>
                  Enter your email and we&apos;ll send beta testing links for both iOS and Android.
                </ThemedText>

                <ThemedView
                  type="backgroundElement"
                  style={[styles.signupPanel, isCompact && styles.signupPanelCompact]}
                >
                  <TextInput
                    accessibilityLabel="Email address"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    inputMode="email"
                    keyboardType="email-address"
                    onChangeText={(value) => {
                      setEmail(value);
                      setSubmitted(false);
                      if (emailError) setEmailError('');
                    }}
                    onSubmitEditing={submitBetaSignup}
                    placeholder="you@example.com"
                    placeholderTextColor="rgba(255, 206, 233, 0.62)"
                    returnKeyType="send"
                    style={[styles.emailInput, isCompact && styles.emailInputCompact]}
                    value={email}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canSubmit || isSubmittingEmail}
                    onPress={submitBetaSignup}
                    style={({ pressed }) => [
                      styles.signupButton,
                      isCompact && styles.signupButtonCompact,
                      (!canSubmit || isSubmittingEmail) && styles.signupButtonDisabled,
                      pressed && canSubmit && !isSubmittingEmail && styles.signupButtonPressed,
                    ]}
                  >
                    <ThemedText type="smallBold" style={styles.signupButtonText}>
                      {isSubmittingEmail ? 'Sending...' : 'Send me the beta links'}
                    </ThemedText>
                  </Pressable>
                </ThemedView>

                {emailError ? (
                  <ThemedText type="smallBold" style={styles.errorText}>{emailError}</ThemedText>
                ) : null}
                {submitted ? (
                  <View style={styles.successStack}>
                    <ThemedText type="smallBold" style={styles.successText}>
                      You&apos;re on the list. We&apos;ll send both beta links to {normalizedEmail}.
                    </ThemedText>
                    {Platform.OS === 'web' ? (
                      <Pressable
                        accessibilityRole="link"
                        onPress={openEmailPreview}
                        style={({ pressed }) => [
                          styles.previewEmailButton,
                          pressed && styles.previewEmailButtonPressed,
                        ]}
                      >
                        <ThemedText type="smallBold" style={styles.previewEmailButtonText}>
                          Preview the email
                        </ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          </ScrollView>
        </ScrollView>

        {/* Floating cube — web only, always visible */}
        {Platform.OS === 'web' && (
          <View style={styles.floatingCube} pointerEvents="box-none">
            <PageCube
              currentPage={activePage}
              currentSection={currentSection}
              onSwipePage={scrollToPage}
              onSwipeSection={scrollToSection}
              pageLabels={PAGE_LABELS}
              triggerCount={popCount}
              pageProgress={pageProgress}
            />
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#15151f',
    zIndex: 0,
  },
  backgroundVideo: {
    ...StyleSheet.absoluteFill,
    height: '100%',
    width: '100%',
  },
  backgroundVideoVisible: { opacity: 1 },
  backgroundVideoHidden: { opacity: 0 },
  backgroundOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8, 8, 16, 0.48)',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    zIndex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  dotActive: { backgroundColor: '#ffffff' },
  topPagination: {
    position: 'absolute',
    top: Spacing.three,
    left: 0,
    right: 0,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 120,
  },
  topPaginationTrack: {
    position: 'relative',
    width: 184,
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    backgroundColor: 'rgba(22, 0, 28, 0.46)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
  },
  topPaginationIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '50%',
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    shadowColor: '#ff0a8a',
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  topPaginationItem: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    zIndex: 1,
  },
  topPaginationItemPressed: {
    opacity: 0.78,
  },
  topPaginationDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  topPaginationDotActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#ff0a8a',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  topPaginationText: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0,
    lineHeight: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.34)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  topPaginationTextActive: {
    color: '#ffffff',
    fontWeight: 900,
    textShadowColor: 'rgba(255, 10, 138, 0.68)',
    textShadowRadius: 12,
  },
  bottomPagination: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 20,
  },
  sidePagination: {
    position: 'absolute',
    right: Spacing.three,
    top: 0,
    bottom: 0,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 20,
  },
  scrollView: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
  },
  scrollContent: { flexDirection: 'row' },
  pageScroll: { flex: 1 },
  pageContent: { flexGrow: 1 },

  // Section 0 — Logo
  logoSlide: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.five,
  },
  logoArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    minHeight: 180,
  },
  heroSwipeHints: {
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: 360,
    paddingHorizontal: Spacing.three,
  },
  heroHintRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  heroHintArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 10, 138, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.74)',
    shadowColor: '#ff0a8a',
    shadowOpacity: 0.62,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  heroHintArrowText: {
    color: '#ffffff',
    fontFamily: Fonts.sans,
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 26,
    textAlign: 'center',
    textShadowColor: 'rgba(89, 0, 52, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroHintText: {
    color: '#ffffff',
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: 0,
    lineHeight: 22,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 10, 138, 0.58)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  cubeArea: {
    alignItems: 'center',
    paddingBottom: Spacing.two,
  },

  // Section 1 — Explainer video
  explainerSlide: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.four,
  },
  explainerVideo: {
    width: '100%',
    height: '100%',
    maxWidth: 720,
    maxHeight: 1280,
  },

  // Slide 2 — Beta signup
  signupSlide: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 0, 23, 0.28)',
  },
  signupBrandWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(31, 0, 36, 0.58)',
  },
  signupContent: {
    width: '100%',
    maxWidth: 620,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  signupMark: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    overflow: 'hidden',
    shadowColor: '#ff0a8a',
    shadowOpacity: 0.65,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  signupMarkImage: {
    width: '100%',
    height: '100%',
  },
  signupTitle: {
    textAlign: 'center',
    color: '#ffffff',
    fontFamily: Fonts.sans,
    fontWeight: 900,
    textShadowColor: 'rgba(255, 0, 137, 0.5)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 18,
  },
  signupText: {
    textAlign: 'center',
    maxWidth: 480,
    lineHeight: 26,
    color: '#ffe2f3',
    opacity: 0.96,
    fontWeight: 700,
  },
  signupPanel: {
    width: '100%',
    padding: Spacing.three,
    borderRadius: 8,
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
    backgroundColor: 'rgba(32, 0, 38, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 33, 151, 0.72)',
    shadowColor: '#ff0a8a',
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
  },
  signupPanelCompact: { flexDirection: 'column' },
  emailInput: {
    flex: 1,
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 187, 226, 0.42)',
    color: '#ffffff',
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: 700,
    paddingHorizontal: Spacing.three,
  },
  emailInputCompact: { alignSelf: 'stretch', width: '100%' },
  signupButton: {
    minHeight: 56,
    borderRadius: 8,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff0a8a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
    shadowColor: '#ff0a8a',
    shadowOpacity: 0.48,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  signupButtonCompact: { alignSelf: 'stretch' },
  signupButtonDisabled: { opacity: 0.52 },
  signupButtonPressed: { opacity: 0.82, transform: [{ translateY: 1 }] },
  signupButtonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontFamily: Fonts.sans,
    fontWeight: 900,
  },
  errorText: { color: '#ffd1e9', textAlign: 'center' },
  successStack: {
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: 520,
  },
  successText: { color: '#ffe2f3', textAlign: 'center', maxWidth: 520 },
  previewEmailButton: {
    minHeight: 42,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 10, 138, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255, 187, 226, 0.5)',
  },
  previewEmailButtonPressed: { opacity: 0.78 },
  previewEmailButtonText: { color: '#ffffff', textAlign: 'center' },

  // Floating cube (web only)
  floatingCube: {
    position: 'absolute',
    bottom: CUBE_BOTTOM,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
});
