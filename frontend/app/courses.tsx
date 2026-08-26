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
import { useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import {
  clearActiveRound,
  getActiveRound,
  getActiveSessionId,
  getSelectedCourse,
  getWebhookUrl,
  setSelectedCourse,
  StoredCourse,
} from "@/src/lib/storage";
import { CourseRow, fetchCourses } from "@/src/lib/courses";

export default function CoursesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [query, setQuery] = useState("");
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Block picking if a solo round is in progress (any hole scored) OR a
    // pair session is active — starting mid-round on the wrong course is a
    // no-go; the user must cancel/finish the round first.
    const active = await getActiveRound();
    const hasScoredHole = active?.entries.some((e) => e.score != null || e.putts != null) ?? false;
    const activePair = await getActiveSessionId();
    if (hasScoredHole || activePair) {
      setLocked(true);
      setLoading(false);
      return;
    }
    setLocked(false);
    const current = await getSelectedCourse();
    if (current) setSelectedId(current.id);
    const url = await getWebhookUrl();
    if (!url) {
      setError("Google Sheet isn't connected yet. Open Settings to add the Web App URL.");
      setLoading(false);
      return;
    }
    const res = await fetchCourses(url);
    if (res.ok) {
      setCourses(res.courses);
    } else {
      let message = res.message || `Couldn't load courses (HTTP ${res.status}).`;
      if (res.status === 404)
        message = "Web App returned 404. Redeploy your Apps Script and update the URL in Settings.";
      setError(message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!query.trim()) return courses;
    const q = query.trim().toLowerCase();
    return courses.filter((c) => c.name.toLowerCase().includes(q));
  }, [courses, query]);

  const onPick = async (c: CourseRow) => {
    if (locked) return;
    setPickingId(c.id);
    try {
      const stored: StoredCourse = {
        id: c.id,
        name: c.name,
        latitude: c.latitude,
        longitude: c.longitude,
        holes: c.holes,
      };
      await setSelectedCourse(stored);
      // Wipe any stale (unscored) active round so the next round uses this course.
      await clearActiveRound();
      setSelectedId(c.id);
      router.back();
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
        <Text style={styles.title}>Select Course</Text>
        <View style={{ width: 32 }} />
      </View>

      {locked ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={28} color={colors.borderStrong} />
          <Text style={styles.hint}>
            A round is in progress. Finish it or cancel it before changing course.
          </Text>
          <Pressable
            onPress={() => router.replace("/round")}
            testID="courses-resume-round"
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Return to round</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              await clearActiveRound();
              setLocked(false);
              // Reload courses now that we've cleared the block
              load();
            }}
            testID="courses-cancel-round"
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={styles.cancelBtnText}>Cancel round</Text>
          </Pressable>
        </View>
      ) : (
        <>
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
              <Text style={styles.hint}>Loading courses…</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle" size={26} color={colors.error} />
              <Text style={styles.errorText} testID="courses-error">{error}</Text>
              <Pressable onPress={load} style={styles.primaryBtn} testID="courses-retry-button">
                <Text style={styles.primaryBtnText}>Retry</Text>
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
                  <Text style={styles.hint}>
                    {query.trim() ? "No courses match." : "No courses in the sheet yet."}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const par = item.holes.reduce((s, h) => s + h.par, 0);
                const isCurrent = item.id === selectedId;
                return (
                  <Pressable
                    testID={`course-row-${item.id}`}
                    onPress={() => onPick(item)}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                  >
                    <View style={[styles.rowIcon, isCurrent && styles.rowIconActive]}>
                      <Ionicons
                        name={isCurrent ? "checkmark" : "flag"}
                        size={20}
                        color={isCurrent ? colors.onBrandPrimary : colors.brand}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.rowMeta}>
                        18 holes · Par {par}
                        {isCurrent ? " · currently selected" : ""}
                      </Text>
                    </View>
                    {pickingId === item.id ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={() => router.push("/add-course")}
              testID="courses-add-button"
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.addBtnText}>ADD NEW COURSE</Text>
            </Pressable>
          </View>
        </>
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
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: typography.display, fontSize: 22, color: colors.onSurface },
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
  rowIconActive: { backgroundColor: colors.brandPrimary },
  rowName: { fontFamily: typography.textBold, fontSize: 16, color: colors.onSurface },
  rowMeta: { marginTop: 2, fontFamily: typography.text, color: colors.muted, fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.divider },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  hint: { color: colors.muted, fontFamily: typography.text, textAlign: "center", lineHeight: 20 },
  errorText: { color: colors.error, fontFamily: typography.text, textAlign: "center" },
  primaryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontFamily: typography.textBold },
  cancelBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.error,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cancelBtnText: {
    color: colors.error,
    fontFamily: typography.textBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  addBtn: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  addBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 14,
    letterSpacing: 1.5,
  },
});
