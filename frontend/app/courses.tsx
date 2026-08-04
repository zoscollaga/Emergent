import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import { ApiCourse, fetchCourseDetail, fetchNearbyCourses } from "@/src/lib/api";
import {
  StoredCourse,
  getCourseOverride,
  setSelectedCourse,
} from "@/src/lib/storage";

export default function CoursesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<ApiCourse[]>([]);
  const [query, setQuery] = useState("");
  const [pickingId, setPickingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat = -37.9739;
      let lng = 145.0349;
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
      const list = await fetchNearbyCourses(lat, lng);
      setCourses(list);
    } catch (e: any) {
      setError("Couldn't load nearby courses. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!query.trim()) return courses;
    const q = query.trim().toLowerCase();
    return courses.filter((c) => c.name.toLowerCase().includes(q));
  }, [courses, query]);

  const onPick = async (c: ApiCourse) => {
    setPickingId(c.id);
    try {
      const detail = await fetchCourseDetail(c.id, c.name, c.latitude, c.longitude);
      const override = await getCourseOverride(detail.id);
      const stored: StoredCourse = {
        id: detail.id,
        name: detail.name,
        latitude: detail.latitude,
        longitude: detail.longitude,
        distance_km: c.distance_km,
        holes: override || detail.holes,
      };
      await setSelectedCourse(stored);
      router.back();
    } catch (e) {
      setError("Failed to load course.");
    } finally {
      setPickingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="courses-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          testID="courses-back-button"
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Nearby Courses</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          testID="course-search-input"
          value={query}
          onChangeText={setQuery}
          placeholder="Search courses"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={styles.center} testID="courses-loading">
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.hint}>Finding courses…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error} testID="courses-error">{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn} testID="courses-retry-button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.hint}>No courses match.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`course-row-${item.id}`}
              onPress={() => onPick(item)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="flag" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
                {item.distance_km != null && (
                  <Text style={styles.rowMeta}>{item.distance_km.toFixed(1)} km away</Text>
                )}
              </View>
              {pickingId === item.id ? (
                <ActivityIndicator color={colors.brand} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              )}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: typography.display,
    fontSize: 22,
    color: colors.onSurface,
  },
  searchWrap: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontFamily: typography.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: {
    fontFamily: typography.textBold,
    fontSize: 16,
    color: colors.onSurface,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: typography.text,
    color: colors.muted,
    fontSize: 13,
  },
  divider: { height: 1, backgroundColor: colors.divider },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  hint: { color: colors.muted, fontFamily: typography.text },
  error: { color: colors.error, fontFamily: typography.text, textAlign: "center" },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  retryText: { color: colors.onBrandPrimary, fontFamily: typography.textBold },
});
