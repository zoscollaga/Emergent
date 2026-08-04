import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import { fetchCourseDetail, fetchNearbyCourses } from "@/src/lib/api";
import {
  StoredCourse,
  getCourseOverride,
  getSelectedCourse,
  setSelectedCourse,
} from "@/src/lib/storage";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1742498626081-a64f9677f468?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzl8MHwxfHNlYXJjaHwxfHwlMjJnb2xmJTIwY291cnNlJTIwbGFuZHNjYXBlJTIyfGVufDB8fHx8MTc4NTgxMzk5MXww&ixlib=rb-4.1.0&q=85";

export default function HomeScreen() {
  const router = useRouter();
  const [course, setCourse] = useState<StoredCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");

  const loadOrDetect = useCallback(async () => {
    setLoading(true);
    setStatus("Loading last course…");
    const cached = await getSelectedCourse();
    if (cached) {
      setCourse(cached);
      setLoading(false);
      return;
    }

    // No cached course → try GPS + nearby lookup
    setStatus("Requesting location…");
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        setStatus("Location permission denied. Please pick a course.");
        setLoading(false);
        return;
      }
      setStatus("Detecting nearby courses…");
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nearby = await fetchNearbyCourses(
        loc.coords.latitude,
        loc.coords.longitude,
      );
      if (nearby.length === 0) {
        setStatus("No nearby courses found.");
        setLoading(false);
        return;
      }
      const closest = nearby[0];
      const detail = await fetchCourseDetail(
        closest.id,
        closest.name,
        closest.latitude,
        closest.longitude,
      );
      const override = await getCourseOverride(detail.id);
      const stored: StoredCourse = {
        id: detail.id,
        name: detail.name,
        latitude: detail.latitude,
        longitude: detail.longitude,
        distance_km: closest.distance_km,
        holes: override || detail.holes,
      };
      await setSelectedCourse(stored);
      setCourse(stored);
    } catch (e: any) {
      setStatus(`Couldn't detect location. Pick a course manually.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // refresh when returning from course selector
      (async () => {
        const cached = await getSelectedCourse();
        if (cached) setCourse(cached);
      })();
    }, []),
  );

  useEffect(() => {
    loadOrDetect();
  }, [loadOrDetect]);

  return (
    <View style={styles.root} testID="home-screen">
      <View style={styles.hero}>
        <Image
          source={{ uri: HERO_IMAGE }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={300}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={styles.heroContent} edges={["top"]}>
          <Text style={styles.brandLabel} testID="brand-label">GOLF SCORECARD</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.eyebrow}>Closest course</Text>
          <Text style={styles.courseName} numberOfLines={2} testID="current-course-name">
            {course ? course.name : loading ? "Locating…" : "No course selected"}
          </Text>
          {course?.distance_km != null && (
            <Text style={styles.courseMeta} testID="current-course-distance">
              {course.distance_km.toFixed(1)} km away · 18 holes
            </Text>
          )}
        </SafeAreaView>
      </View>

      <SafeAreaView style={styles.actions} edges={["bottom"]}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : (
          <>
            {!course && (
              <Text style={styles.statusHint} testID="home-status">{status}</Text>
            )}
            <Pressable
              testID="start-round-button"
              disabled={!course}
              onPress={() => router.push("/round")}
              style={({ pressed }) => [
                styles.primaryBtn,
                !course && styles.primaryBtnDisabled,
                pressed && course && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="golf" size={22} color={colors.onBrandPrimary} />
              <Text style={styles.primaryBtnText}>START ROUND</Text>
            </Pressable>
            <Pressable
              testID="change-course-button"
              onPress={() => router.push("/courses")}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.secondaryBtnText}>Change course</Text>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { flex: 1, backgroundColor: "#0b1a12" },
  heroContent: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  brandLabel: {
    color: colors.onBrandSecondary,
    letterSpacing: 3,
    fontFamily: typography.textBold,
    fontSize: 12,
    opacity: 0.9,
  },
  eyebrow: {
    color: "#D1FAE5",
    fontFamily: typography.text,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  courseName: {
    color: colors.onBrandSecondary,
    fontFamily: typography.display,
    fontSize: 40,
    lineHeight: 44,
  },
  courseMeta: {
    color: "#D1FAE5",
    fontFamily: typography.text,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  actions: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    backgroundColor: colors.brandPrimary,
    height: 68,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryBtnDisabled: { backgroundColor: colors.borderStrong },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 18,
    letterSpacing: 1.5,
  },
  secondaryBtn: {
    marginTop: spacing.md,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: colors.brand,
    fontFamily: typography.textBold,
    fontSize: 15,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  statusText: {
    color: colors.onSurfaceSecondary,
    fontFamily: typography.text,
    fontSize: 14,
  },
  statusHint: {
    color: colors.muted,
    fontFamily: typography.text,
    fontSize: 13,
    textAlign: "center",
    marginBottom: spacing.md,
  },
});
