import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import {
  ActiveRound,
  HoleEntry,
  StoredCourse,
  clearActiveRound,
  getActiveRound,
  getSelectedCourse,
  pushRoundHistory,
  setActiveRound,
} from "@/src/lib/storage";
import { saveRound } from "@/src/lib/api";

export default function RoundScreen() {
  const router = useRouter();
  const [course, setCourse] = useState<StoredCourse | null>(null);
  const [entries, setEntries] = useState<HoleEntry[]>([]);
  const [currentHole, setCurrentHole] = useState(1); // 1..18
  const [ready, setReady] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    (async () => {
      const existing = await getActiveRound();
      if (existing) {
        setCourse(existing.course);
        setEntries(existing.entries);
        setCurrentHole(existing.currentHole);
      } else {
        const c = await getSelectedCourse();
        if (!c) {
          router.replace("/");
          return;
        }
        const initial: HoleEntry[] = c.holes.map((h) => ({
          number: h.number,
          score: null,
          putts: null,
        }));
        const fresh: ActiveRound = {
          course: c,
          entries: initial,
          currentHole: 1,
          startedAt: new Date().toISOString(),
        };
        await setActiveRound(fresh);
        setCourse(c);
        setEntries(initial);
        setCurrentHole(1);
      }
      setReady(true);
    })();
  }, [router]);

  const persist = useCallback(
    async (nextEntries: HoleEntry[], nextHole: number) => {
      if (!course) return;
      const ar: ActiveRound = {
        course,
        entries: nextEntries,
        currentHole: nextHole,
        startedAt: new Date().toISOString(),
      };
      await setActiveRound(ar);
    },
    [course],
  );

  const holeInfo = useMemo(() => {
    if (!course) return null;
    return course.holes.find((h) => h.number === currentHole) || null;
  }, [course, currentHole]);

  const entry = useMemo(
    () => entries.find((e) => e.number === currentHole) || null,
    [entries, currentHole],
  );

  const updateField = (field: "score" | "putts", delta: number) => {
    if (!entry) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const current = entry[field];
    const base = current ?? (field === "score" ? holeInfo?.par ?? 4 : 2);
    const next = Math.max(0, Math.min(20, base + delta));
    const updated = entries.map((e) =>
      e.number === currentHole ? { ...e, [field]: next } : e,
    );
    setEntries(updated);
    persist(updated, currentHole);
  };

  const goPrev = () => {
    if (currentHole <= 1) return;
    Haptics.selectionAsync().catch(() => {});
    const nh = currentHole - 1;
    setCurrentHole(nh);
    persist(entries, nh);
  };

  const goNext = () => {
    if (currentHole >= 18) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const nh = currentHole + 1;
    setCurrentHole(nh);
    persist(entries, nh);
  };

  const finishRound = async () => {
    if (!course) return;
    setFinishing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const totalScore = entries.reduce((s, e) => s + (e.score || 0), 0);
    const totalPutts = entries.reduce((s, e) => s + (e.putts || 0), 0);
    const finished = {
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      course_id: course.id,
      course_name: course.name,
      holes: entries,
      total_score: totalScore,
      total_putts: totalPutts,
    };
    await pushRoundHistory(finished);
    // Best-effort remote save; offline-friendly
    try {
      await saveRound({
        course_id: course.id,
        course_name: course.name,
        latitude: course.latitude,
        longitude: course.longitude,
        holes: entries,
      });
    } catch {
      // Ignore: offline is fine, we already saved locally
    }
    await clearActiveRound();
    setFinishing(false);
    router.replace({ pathname: "/summary", params: { id: finished.id } });
  };

  if (!ready || !course || !holeInfo || !entry) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const isFirst = currentHole === 1;
  const isLast = currentHole === 18;
  const displayScore = entry.score ?? "-";
  const displayPutts = entry.putts ?? "-";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="round-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace("/")}
          hitSlop={12}
          testID="round-close-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.courseLabel} numberOfLines={1}>{course.name}</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.holeCard}>
        <Text style={styles.holeEyebrow}>HOLE</Text>
        <View style={styles.holeNumberRow}>
          <Text style={styles.holeNumber} testID="hole-number">{currentHole}</Text>
          <Text style={styles.holeOf}>/ 18</Text>
        </View>
        <View style={styles.metaRow}>
          <MetaCell label="Par" value={String(holeInfo.par)} testID="hole-par" />
          <View style={styles.metaDivider} />
          <MetaCell label="Distance" value={`${holeInfo.distance} m`} testID="hole-distance" />
          <View style={styles.metaDivider} />
          <MetaCell label="Index" value={String(holeInfo.index)} testID="hole-index" />
        </View>
      </View>

      <View style={styles.steppersWrap}>
        <Stepper
          label="Score"
          value={displayScore}
          testID="score"
          par={holeInfo.par}
          onMinus={() => updateField("score", -1)}
          onPlus={() => updateField("score", +1)}
        />
        <Stepper
          label="Putts"
          value={displayPutts}
          testID="putts"
          onMinus={() => updateField("putts", -1)}
          onPlus={() => updateField("putts", +1)}
        />
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={goPrev}
          disabled={isFirst}
          testID="previous-hole-button"
          style={({ pressed }) => [
            styles.prevBtn,
            isFirst && styles.btnDisabled,
            pressed && !isFirst && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={isFirst ? colors.borderStrong : colors.onSurface}
          />
          <Text style={[styles.prevBtnText, isFirst && { color: colors.borderStrong }]}>
            Previous
          </Text>
        </Pressable>
        {isLast ? (
          <Pressable
            onPress={finishRound}
            disabled={finishing}
            testID="finish-round-button"
            style={({ pressed }) => [
              styles.nextBtn,
              { backgroundColor: colors.success },
              pressed && { opacity: 0.85 },
            ]}
          >
            {finishing ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Text style={styles.nextBtnText}>Finish Round</Text>
                <Ionicons name="flag" size={22} color={colors.onBrandPrimary} />
              </>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={goNext}
            testID="next-hole-button"
            style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.nextBtnText}>Next Hole</Text>
            <Ionicons name="chevron-forward" size={22} color={colors.onBrandPrimary} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function MetaCell({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  return (
    <View style={styles.metaCell} testID={testID}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  testID,
  par,
}: {
  label: string;
  value: number | string;
  onMinus: () => void;
  onPlus: () => void;
  testID: string;
  par?: number;
}) {
  const rel = typeof value === "number" && par ? value - par : null;
  const relLabel =
    rel == null || value === "-"
      ? null
      : rel === 0
      ? "Par"
      : rel > 0
      ? `+${rel}`
      : `${rel}`;
  const relColor =
    rel == null
      ? colors.muted
      : rel < 0
      ? colors.success
      : rel > 0
      ? colors.error
      : colors.brand;

  return (
    <View style={styles.stepperCard} testID={`${testID}-stepper`}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={onMinus}
          testID={`${testID}-minus`}
          hitSlop={8}
          style={({ pressed }) => [styles.stepperBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="remove" size={30} color={colors.onSurface} />
        </Pressable>
        <View style={styles.stepperValueWrap}>
          <Text style={styles.stepperValue} testID={`${testID}-value`}>{String(value)}</Text>
          {relLabel && (
            <Text style={[styles.stepperRel, { color: relColor }]}>{relLabel}</Text>
          )}
        </View>
        <Pressable
          onPress={onPlus}
          testID={`${testID}-plus`}
          hitSlop={8}
          style={({ pressed }) => [styles.stepperBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="add" size={30} color={colors.onSurface} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  courseLabel: {
    flex: 1,
    textAlign: "center",
    color: colors.onSurfaceSecondary,
    fontFamily: typography.textBold,
    fontSize: 14,
  },
  holeCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  holeEyebrow: {
    color: "#D1FAE5",
    fontFamily: typography.text,
    letterSpacing: 3,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  holeNumberRow: { flexDirection: "row", alignItems: "flex-end" },
  holeNumber: {
    color: colors.onBrandSecondary,
    fontFamily: typography.display,
    fontSize: 64,
    lineHeight: 68,
  },
  holeOf: {
    color: "#A7F3D0",
    fontFamily: typography.display,
    fontSize: 22,
    marginLeft: spacing.sm,
    marginBottom: 12,
  },
  metaRow: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "space-between",
  },
  metaCell: { flex: 1, alignItems: "center" },
  metaLabel: {
    color: "#A7F3D0",
    fontFamily: typography.text,
    fontSize: 11,
    letterSpacing: 1,
  },
  metaValue: {
    color: colors.onBrandSecondary,
    fontFamily: typography.display,
    fontSize: 22,
    marginTop: 4,
  },
  metaDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.15)" },
  steppersWrap: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  stepperCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  stepperLabel: {
    fontFamily: typography.textBold,
    fontSize: 14,
    color: colors.onSurfaceTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperValueWrap: { alignItems: "center", flex: 1 },
  stepperValue: {
    fontFamily: typography.display,
    fontSize: 64,
    color: colors.onSurface,
    lineHeight: 64,
    minWidth: 80,
    textAlign: "center",
  },
  stepperRel: {
    marginTop: 2,
    fontFamily: typography.textBold,
    fontSize: 13,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  prevBtn: {
    flex: 1,
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  prevBtnText: {
    color: colors.onSurface,
    fontFamily: typography.textBold,
    fontSize: 16,
  },
  btnDisabled: { backgroundColor: colors.surfaceSecondary, opacity: 0.5 },
  nextBtn: {
    flex: 1.4,
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  nextBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 16,
  },
});
