import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import { addCourse } from "@/src/lib/courses";
import {
  getIdentifiedMember,
  getWebhookUrl,
  setSelectedCourse,
  StoredCourse,
  StoredHole,
} from "@/src/lib/storage";

type HoleForm = { par: string; distance: string; index: string };

const EMPTY_HOLE = (): HoleForm => ({ par: "4", distance: "", index: "" });

export default function AddCourseScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [holes, setHoles] = useState<HoleForm[]>(() =>
    Array.from({ length: 18 }, () => EMPTY_HOLE()),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhookMissing, setWebhookMissing] = useState(false);
  const parRefs = useRef<(TextInput | null)[]>([]);
  const distRefs = useRef<(TextInput | null)[]>([]);
  const idxRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    (async () => {
      const url = await getWebhookUrl();
      if (!url) setWebhookMissing(true);
    })();
  }, []);

  const totals = useMemo(() => {
    let par = 0;
    let dist = 0;
    let filled = 0;
    holes.forEach((h) => {
      const p = Number(h.par);
      const d = Number(h.distance);
      if (Number.isFinite(p) && p > 0) par += p;
      if (Number.isFinite(d) && d > 0) dist += d;
      if (h.par && h.distance && h.index) filled++;
    });
    return { par, dist, filled };
  }, [holes]);

  const validate = (): { ok: true; holes: StoredHole[] } | { ok: false; message: string } => {
    if (!name.trim()) return { ok: false, message: "Enter a course name." };
    const parsed: StoredHole[] = [];
    const indexes = new Set<number>();
    for (let i = 0; i < 18; i++) {
      const h = holes[i];
      const par = Number(h.par);
      const dist = Number(h.distance);
      const idx = Number(h.index);
      if (!Number.isFinite(par) || par < 3 || par > 6)
        return { ok: false, message: `Hole ${i + 1}: Par must be 3–6.` };
      if (!Number.isFinite(dist) || dist <= 0)
        return { ok: false, message: `Hole ${i + 1}: Distance is required.` };
      if (!Number.isFinite(idx) || idx < 1 || idx > 18)
        return { ok: false, message: `Hole ${i + 1}: Stroke Index must be 1–18.` };
      if (indexes.has(idx))
        return { ok: false, message: `Stroke Index ${idx} is used more than once.` };
      indexes.add(idx);
      parsed.push({ number: i + 1, par, distance: dist, index: idx });
    }
    return { ok: true, holes: parsed };
  };

  const onSubmit = async () => {
    const v = validate();
    if (!v.ok) {
      setError(v.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setError(null);
    const url = await getWebhookUrl();
    if (!url) {
      setWebhookMissing(true);
      return;
    }
    setSubmitting(true);
    Haptics.selectionAsync().catch(() => {});
    const me = await getIdentifiedMember();
    const addedBy = me ? `${me.first_name} ${me.last_name} (#${me.member_id})` : "";
    const res = await addCourse(url, {
      name: name.trim(),
      holes: v.holes,
      added_by: addedBy,
    });
    setSubmitting(false);
    if (res.ok) {
      const stored: StoredCourse = {
        id: res.course.id,
        name: res.course.name,
        latitude: res.course.latitude,
        longitude: res.course.longitude,
        holes: res.course.holes,
      };
      await setSelectedCourse(stored);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/");
    } else {
      setError(res.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const updateHole = (i: number, key: keyof HoleForm, value: string) => {
    setHoles((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [key]: value };
      return copy;
    });
    if (error) setError(null);
  };

  const focusNextInHole = (i: number, key: keyof HoleForm) => {
    if (key === "par") distRefs.current[i]?.focus();
    else if (key === "distance") idxRefs.current[i]?.focus();
    else if (key === "index" && i < 17) parRefs.current[i + 1]?.focus();
  };

  if (webhookMissing) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Add course</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="link-outline" size={28} color={colors.brand} />
          <Text style={styles.hint}>
            Google Sheet isn{"\u2019"}t connected. Open Settings to paste the Web App URL.
          </Text>
          <Pressable
            onPress={() => router.replace("/settings")}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Open Settings</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="add-course-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Add course</Text>
          <Text style={styles.subtitle}>Enter Par, Distance & Stroke Index for 18 holes</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.label}>Course name</Text>
            <TextInput
              testID="add-course-name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Royal Melbourne Golf Club"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCorrect
              autoCapitalize="words"
            />
          </View>

          <View style={styles.tableCard}>
            <View style={styles.gridHeader}>
              <Text style={[styles.gridHeaderText, styles.gridHole]}>#</Text>
              <Text style={[styles.gridHeaderText, styles.gridPar]}>Par</Text>
              <Text style={[styles.gridHeaderText, styles.gridDist]}>Dist (m)</Text>
              <Text style={[styles.gridHeaderText, styles.gridIdx]}>Idx</Text>
            </View>
            {holes.map((h, i) => (
              <View key={i} style={styles.gridRow} testID={`hole-row-${i + 1}`}>
                <Text style={styles.gridHoleText}>{i + 1}</Text>
                <TextInput
                  ref={(r) => { parRefs.current[i] = r; }}
                  testID={`hole-par-${i + 1}`}
                  value={h.par}
                  onChangeText={(v) => updateHole(i, "par", v.replace(/[^0-9]/g, ""))}
                  onSubmitEditing={() => focusNextInHole(i, "par")}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  maxLength={1}
                  style={[styles.gridInput, styles.gridPar]}
                  selectTextOnFocus
                />
                <TextInput
                  ref={(r) => { distRefs.current[i] = r; }}
                  testID={`hole-distance-${i + 1}`}
                  value={h.distance}
                  onChangeText={(v) => updateHole(i, "distance", v.replace(/[^0-9]/g, ""))}
                  onSubmitEditing={() => focusNextInHole(i, "distance")}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  maxLength={4}
                  style={[styles.gridInput, styles.gridDist]}
                  selectTextOnFocus
                />
                <TextInput
                  ref={(r) => { idxRefs.current[i] = r; }}
                  testID={`hole-index-${i + 1}`}
                  value={h.index}
                  onChangeText={(v) => updateHole(i, "index", v.replace(/[^0-9]/g, ""))}
                  onSubmitEditing={() => focusNextInHole(i, "index")}
                  keyboardType="number-pad"
                  returnKeyType={i < 17 ? "next" : "done"}
                  maxLength={2}
                  style={[styles.gridInput, styles.gridIdx]}
                  selectTextOnFocus
                />
              </View>
            ))}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsText}>
                Total Par {totals.par || "—"} · Total Distance {totals.dist ? `${totals.dist} m` : "—"} · {totals.filled}/18 filled
              </Text>
            </View>
          </View>

          {error && (
            <View style={styles.errorBanner} testID="add-course-error">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={onSubmit}
            disabled={submitting}
            testID="add-course-submit"
            style={({ pressed }) => [
              styles.submitBtn,
              submitting && styles.btnDisabled,
              pressed && !submitting && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.submitBtnText}>SAVE COURSE</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.helperText}>
            Once saved the course becomes available to everyone. The admin ({"\u2709"}) receives an FYI email and can edit or delete the row directly in the sheet.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.onSurface },
  subtitle: { fontFamily: typography.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    fontFamily: typography.textBold,
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: typography.text,
    fontSize: 16,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  tableCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: 8,
  },
  gridHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 6,
  },
  gridHeaderText: {
    fontFamily: typography.textBold,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    textAlign: "center",
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 5,
    gap: 6,
  },
  gridHole: { width: 24, textAlign: "center" },
  gridHoleText: {
    width: 24,
    fontFamily: typography.textBold,
    fontSize: 13,
    color: colors.onSurface,
    textAlign: "center",
  },
  gridPar: { width: 46 },
  gridDist: { flex: 1 },
  gridIdx: { width: 46 },
  gridCell: { flex: 1 },
  gridInput: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 4,
    fontFamily: typography.textBold,
    fontSize: 14,
    color: colors.onSurface,
    backgroundColor: colors.surface,
    textAlign: "center",
  },
  totalsRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    marginTop: 4,
  },
  totalsText: {
    fontFamily: typography.textBold,
    fontSize: 12,
    color: colors.brand,
    textAlign: "center",
    letterSpacing: 0.4,
  },
  errorBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { flex: 1, color: "#991B1B", fontFamily: typography.textBold, fontSize: 13 },
  submitBtn: {
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  submitBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 14,
    letterSpacing: 1.5,
  },
  btnDisabled: { opacity: 0.6 },
  helperText: {
    fontFamily: typography.text,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
  },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md, flex: 1 },
  hint: { color: colors.muted, fontFamily: typography.text, textAlign: "center" },
  primaryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontFamily: typography.textBold },
});
