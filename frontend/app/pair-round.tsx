import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import {
  ApiSession,
  getSession,
  submitHole,
} from "@/src/lib/api";
import { getDeviceId, getIdentifiedMember, getMembersWebhook, IdentifiedMember } from "@/src/lib/storage";
import { fetchMembers, Member } from "@/src/lib/members";

type Status = "pending" | "verified" | "mismatch";

type LocalEntry = {
  player_score: number | null;
  player_putts: number | null;
  marker_score: number | null;
  marker_putts: number | null;
};

export default function PairRoundScreen() {
  const router = useRouter();
  const { sid } = useLocalSearchParams<{ sid?: string }>();
  const [deviceId, setDeviceId] = useState<string>("");
  const [session, setSession] = useState<ApiSession | null>(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [entries, setEntries] = useState<Record<number, LocalEntry>>({});
  const [meMember, setMeMember] = useState<IdentifiedMember | Member | null>(null);
  const [partnerMember, setPartnerMember] = useState<Member | null>(null);
  // Track submitted values so we can detect edits vs last submitted
  const lastSubmittedRef = useRef<Record<number, LocalEntry>>({});

  useEffect(() => {
    (async () => {
      setDeviceId(await getDeviceId());
      setMeMember(await getIdentifiedMember());
    })();
  }, []);

  // Initial + polling load
  const load = useCallback(async () => {
    if (!sid) return;
    try {
      const s = await getSession(String(sid));
      setSession(s);
      // Seed local entries from server for this device
      const mine: Record<number, LocalEntry> = {};
      s.hole_entries
        .filter((e) => e.device_id === deviceId)
        .forEach((e) => {
          mine[e.hole_number] = {
            player_score: e.player_score,
            player_putts: e.player_putts,
            marker_score: e.marker_score,
            marker_putts: e.marker_putts,
          };
          lastSubmittedRef.current[e.hole_number] = { ...mine[e.hole_number] };
        });
      setEntries((prev) => ({ ...mine, ...prev }));
      setReady(true);
    } catch (e) {
      setError("Couldn't reach the round. Check your connection.");
    }
  }, [sid, deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [deviceId, load]);

  const hole = useMemo(
    () => session?.holes.find((h) => h.number === currentHole) || null,
    [session, currentHole],
  );

  const entry: LocalEntry = entries[currentHole] || {
    player_score: null,
    player_putts: null,
    marker_score: null,
    marker_putts: null,
  };

  // Auto-fill defaults (score=par, putts=2) the first time a hole is opened on
  // this device. Preserves any values already entered/submitted.
  useEffect(() => {
    if (!ready || !hole) return;
    const cur = entries[currentHole];
    const needsInit =
      !cur ||
      cur.player_score == null ||
      cur.player_putts == null ||
      cur.marker_score == null ||
      cur.marker_putts == null;
    if (!needsInit) return;
    setEntries((prev) => {
      const existing = prev[currentHole];
      return {
        ...prev,
        [currentHole]: {
          player_score: existing?.player_score ?? hole.par,
          player_putts: existing?.player_putts ?? 2,
          marker_score: existing?.marker_score ?? hole.par,
          marker_putts: existing?.marker_putts ?? 2,
        },
      };
    });
  }, [ready, currentHole, hole, entries]);

  const holeStatus: Status =
    (session?.hole_status?.[String(currentHole)] as Status) || "pending";

  // Have both devices submitted for this hole?
  const submissionsForHole = session?.hole_entries.filter((e) => e.hole_number === currentHole) || [];
  const bothSubmitted = submissionsForHole.length >= 2;
  const mySubmission = submissionsForHole.find((e) => e.device_id === deviceId) || null;

  // Detect local edits after last submit (so we can prompt to re-submit)
  const last = lastSubmittedRef.current[currentHole];
  const dirty =
    !last ||
    last.player_score !== entry.player_score ||
    last.player_putts !== entry.player_putts ||
    last.marker_score !== entry.marker_score ||
    last.marker_putts !== entry.marker_putts;

  const partner = session?.players.find((p) => p.device_id !== deviceId);
  const me = session?.players.find((p) => p.device_id === deviceId);

  // Fetch partner's member info from Members webhook once we know their id
  useEffect(() => {
    if (!partner?.member_id || partnerMember?.member_id === partner.member_id) return;
    (async () => {
      const url = await getMembersWebhook();
      if (!url) return;
      const res = await fetchMembers(url);
      if (res.ok) {
        const target = String(partner.member_id).trim();
        const found = res.members.find(
          (m) => String(m.member_id).trim() === target,
        );
        if (found) setPartnerMember(found);
      }
    })();
  }, [partner?.member_id, partnerMember?.member_id]);

  const [playerLabel, markerLabel] = disambiguateNames(
    meMember ? { first_name: meMember.first_name, last_name: meMember.last_name, member_id: (meMember as any).member_id || me?.member_id || "" } : null,
    partnerMember ? { first_name: partnerMember.first_name, last_name: partnerMember.last_name, member_id: partnerMember.member_id } : null,
    me?.member_id || "",
    partner?.member_id || "",
  );

  const updateField = (field: keyof LocalEntry, delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const par = hole?.par ?? 4;
    const isScore = field === "player_score" || field === "marker_score";
    const current = entry[field];
    const base = current ?? (isScore ? par : 2);
    const next = Math.max(0, Math.min(20, base + delta));
    setEntries((prev) => ({
      ...prev,
      [currentHole]: { ...entry, [field]: next },
    }));
  };

  const submit = async () => {
    if (!session || !hole) return;
    if (
      entry.player_score == null ||
      entry.player_putts == null ||
      entry.marker_score == null ||
      entry.marker_putts == null
    ) {
      setError("Enter all four values before submitting.");
      return;
    }
    setError(null);
    setSubmitting(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      const s = await submitHole(session.id, currentHole, {
        device_id: deviceId,
        player_score: entry.player_score,
        player_putts: entry.player_putts,
        marker_score: entry.marker_score,
        marker_putts: entry.marker_putts,
      });
      setSession(s);
      lastSubmittedRef.current[currentHole] = { ...entry };
    } catch (e) {
      setError("Submit failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const goPrev = () => {
    if (currentHole <= 1) return;
    Haptics.selectionAsync().catch(() => {});
    setCurrentHole((n) => n - 1);
  };

  const goNext = () => {
    if (holeStatus !== "verified") return;
    if (currentHole >= 18) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCurrentHole((n) => n + 1);
  };

  const finish = () => {
    if (!session) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.replace({ pathname: "/pair-summary", params: { sid: session.id } });
  };

  if (!ready || !session || !hole) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const isFirst = currentHole === 1;
  const isLast = currentHole === 18;

  // Row colouring based on status
  const rowState: "mismatch" | "verified" | "waiting" | "idle" =
    holeStatus === "mismatch"
      ? "mismatch"
      : holeStatus === "verified"
      ? "verified"
      : bothSubmitted
      ? "waiting"
      : mySubmission && !bothSubmitted
      ? "waiting"
      : "idle";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="pair-round-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace("/")}
          hitSlop={12}
          testID="pair-round-close-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerCentre}>
          <Text style={styles.courseLabel} numberOfLines={1}>{session.course_name}</Text>
          <Text style={styles.pairLabel}>
            {me?.member_id || "----"} · Marker: {partner?.member_id || "waiting…"}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.holeCard}>
        <View style={styles.holeCardLeft}>
          <Text style={styles.holeEyebrow}>HOLE</Text>
          <View style={styles.holeNumberRow}>
            <Text style={styles.holeNumber} testID="hole-number">{currentHole}</Text>
            <Text style={styles.holeOf}>/ 18</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <MetaCell label="Par" value={String(hole.par)} testID="hole-par" />
          <View style={styles.metaDivider} />
          <MetaCell label="Distance" value={`${hole.distance} m`} testID="hole-distance" />
          <View style={styles.metaDivider} />
          <MetaCell label="Index" value={String(hole.index)} testID="hole-index" />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          <FieldRow
            title={`${playerLabel.toUpperCase()} (#${me?.member_id || "----"}) [P]`}
            scoreLabel="Score"
            scoreValue={entry.player_score}
            puttsValue={entry.player_putts}
            par={hole.par}
            state={rowState}
            onScoreMinus={() => updateField("player_score", -1)}
            onScorePlus={() => updateField("player_score", +1)}
            onPuttsMinus={() => updateField("player_putts", -1)}
            onPuttsPlus={() => updateField("player_putts", +1)}
            testID="player"
          />
          <FieldRow
            title={`${markerLabel.toUpperCase()} (#${partner?.member_id || "----"}) [M]`}
            scoreLabel="Score"
            scoreValue={entry.marker_score}
            puttsValue={entry.marker_putts}
            par={hole.par}
            state={rowState}
            onScoreMinus={() => updateField("marker_score", -1)}
            onScorePlus={() => updateField("marker_score", +1)}
            onPuttsMinus={() => updateField("marker_putts", -1)}
            onPuttsPlus={() => updateField("marker_putts", +1)}
            testID="marker"
          />
        </View>

        <View style={styles.statusBar}>
          <StatusBadge state={rowState} bothSubmitted={bothSubmitted} mine={!!mySubmission} />
          {error && <Text style={styles.errorText} testID="pair-round-error">{error}</Text>}
        </View>
      </ScrollView>

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
        </Pressable>

        {holeStatus === "verified" && !dirty ? (
          isLast ? (
            <Pressable
              onPress={finish}
              testID="finish-round-button"
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.success },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.actionBtnText}>Finish Round</Text>
              <Ionicons name="flag" size={20} color={colors.onBrandPrimary} />
            </Pressable>
          ) : (
            <Pressable
              onPress={goNext}
              testID="next-hole-button"
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.actionBtnText}>Next Hole</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.onBrandPrimary} />
            </Pressable>
          )
        ) : (
          <Pressable
            onPress={submit}
            disabled={submitting}
            testID="submit-hole-button"
            style={({ pressed }) => [
              styles.actionBtn,
              rowState === "mismatch" && { backgroundColor: colors.error },
              submitting && styles.btnDisabled,
              pressed && !submitting && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons
                  name={rowState === "mismatch" ? "refresh" : "checkmark"}
                  size={20}
                  color={colors.onBrandPrimary}
                />
                <Text style={styles.actionBtnText}>
                  {rowState === "mismatch"
                    ? "Re-submit"
                    : mySubmission && !dirty
                    ? "Waiting for marker…"
                    : "Submit hole"}
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function StatusBadge({
  state,
  bothSubmitted,
  mine,
}: {
  state: "mismatch" | "verified" | "waiting" | "idle";
  bothSubmitted: boolean;
  mine: boolean;
}) {
  let icon: any = "hourglass-outline";
  let text = "Enter your scores and your marker's, then submit.";
  let bg = colors.surfaceSecondary;
  let fg = colors.onSurfaceSecondary;
  if (state === "mismatch") {
    icon = "close-circle";
    text = "Scores don't match. Both re-enter and re-submit to continue.";
    bg = "#FEE2E2";
    fg = "#991B1B";
  } else if (state === "verified") {
    icon = "shield-checkmark";
    text = "Verified. Tap Next Hole to continue.";
    bg = colors.brandTertiary;
    fg = colors.brand;
  } else if (state === "waiting") {
    icon = "cloud-upload-outline";
    text = mine && !bothSubmitted
      ? "Submitted. Waiting for your marker…"
      : "Marker submitted. Enter and submit yours.";
    bg = "#FEF3C7";
    fg = "#92400E";
  }
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} testID="hole-status-badge">
      <Ionicons name={icon} size={16} color={fg} />
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

function FieldRow({
  title,
  scoreValue,
  puttsValue,
  par,
  state,
  onScoreMinus,
  onScorePlus,
  onPuttsMinus,
  onPuttsPlus,
  testID,
}: {
  title: string;
  scoreLabel?: string;
  scoreValue: number | null;
  puttsValue: number | null;
  par: number;
  state: "mismatch" | "verified" | "waiting" | "idle";
  onScoreMinus: () => void;
  onScorePlus: () => void;
  onPuttsMinus: () => void;
  onPuttsPlus: () => void;
  testID: string;
}) {
  const bg =
    state === "mismatch"
      ? "#FEE2E2"
      : state === "verified"
      ? colors.brandTertiary
      : colors.surfaceSecondary;
  const border =
    state === "mismatch"
      ? colors.error
      : state === "verified"
      ? colors.success
      : "transparent";

  return (
    <View
      style={[styles.rowCard, { backgroundColor: bg, borderColor: border, borderWidth: state === "idle" ? 0 : 2 }]}
      testID={`${testID}-row`}
    >
      <Text style={styles.rowTitle}>{title}</Text>
      <View style={styles.stepperInline}>
        <Text style={styles.stepperInlineLabel}>Score</Text>
        <MiniStepper
          value={scoreValue}
          par={par}
          onMinus={onScoreMinus}
          onPlus={onScorePlus}
          testID={`${testID}-score`}
        />
      </View>
      <View style={styles.stepperInline}>
        <Text style={styles.stepperInlineLabel}>Putts</Text>
        <MiniStepper
          value={puttsValue}
          onMinus={onPuttsMinus}
          onPlus={onPuttsPlus}
          testID={`${testID}-putts`}
        />
      </View>
    </View>
  );
}

function MiniStepper({
  value,
  par,
  onMinus,
  onPlus,
  testID,
}: {
  value: number | null;
  par?: number;
  onMinus: () => void;
  onPlus: () => void;
  testID: string;
}) {
  const rel = value != null && par != null ? value - par : null;
  const relLabel = rel == null ? "" : rel === 0 ? "E" : rel > 0 ? `+${rel}` : `${rel}`;
  return (
    <View style={styles.miniStepperRow}>
      <Pressable
        onPress={onMinus}
        hitSlop={8}
        testID={`${testID}-minus`}
        style={({ pressed }) => [styles.miniBtn, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="remove" size={24} color={colors.onSurface} />
      </Pressable>
      <View style={styles.miniValueWrap}>
        <Text style={styles.miniValue} testID={`${testID}-value`}>
          {value == null ? "-" : String(value)}
        </Text>
        {par != null && value != null && (
          <Text style={styles.miniRel}>{relLabel}</Text>
        )}
      </View>
      <Pressable
        onPress={onPlus}
        hitSlop={8}
        testID={`${testID}-plus`}
        style={({ pressed }) => [styles.miniBtn, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="add" size={24} color={colors.onSurface} />
      </Pressable>
    </View>
  );
}

function MetaCell({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.metaCell} testID={testID}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

type NameSlot = { first_name: string; last_name: string; member_id: string } | null;

/** Return distinct display names for two people. Uses first names when they differ;
 *  otherwise extends with last-name characters until they diverge. Falls back to
 *  "Player" / "Marker" when member info isn't loaded yet. */
function disambiguateNames(a: NameSlot, b: NameSlot, meId: string, partnerId: string): [string, string] {
  if (!a && !b) return ["Player", "Marker"];
  const aFirst = (a?.first_name || "").trim();
  const bFirst = (b?.first_name || "").trim();
  const aLast = (a?.last_name || "").trim();
  const bLast = (b?.last_name || "").trim();
  const aFallback = meId ? `Player` : "Player";
  const bFallback = partnerId ? `Marker` : "Marker";
  if (!aFirst && !bFirst) return [aFallback, bFallback];
  if (!aFirst) return [aFallback, bFirst || bFallback];
  if (!bFirst) return [aFirst, bFallback];
  if (aFirst.toLowerCase() !== bFirst.toLowerCase()) return [aFirst, bFirst];
  // Same first name — extend with last name characters until distinct
  for (let n = 1; n <= Math.max(aLast.length, bLast.length); n++) {
    const aSlice = aLast.slice(0, n);
    const bSlice = bLast.slice(0, n);
    if (aSlice.toLowerCase() !== bSlice.toLowerCase()) {
      return [`${aFirst} ${aSlice}`, `${bFirst} ${bSlice}`];
    }
  }
  // Fully identical names — fall back to member IDs
  return [`${aFirst} #${meId}`, `${bFirst} #${partnerId}`];
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerCentre: { flex: 1, alignItems: "center" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  courseLabel: {
    color: colors.onSurfaceSecondary,
    fontFamily: typography.textBold,
    fontSize: 13,
  },
  pairLabel: {
    color: colors.muted,
    fontFamily: typography.text,
    fontSize: 11,
    marginTop: 2,
  },
  holeCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  holeCardLeft: { alignItems: "center", minWidth: 72 },
  holeEyebrow: {
    color: "#D1FAE5",
    fontFamily: typography.text,
    letterSpacing: 3,
    fontSize: 10,
    marginBottom: 2,
  },
  holeNumberRow: { flexDirection: "row", alignItems: "flex-end" },
  holeNumber: {
    color: colors.onBrandSecondary,
    fontFamily: typography.display,
    fontSize: 42,
    lineHeight: 44,
  },
  holeOf: {
    color: "#A7F3D0",
    fontFamily: typography.display,
    fontSize: 16,
    marginLeft: 4,
    marginBottom: 6,
  },
  metaRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaCell: { flex: 1, alignItems: "center" },
  metaLabel: {
    color: "#A7F3D0",
    fontFamily: typography.text,
    fontSize: 10,
    letterSpacing: 1,
  },
  metaValue: {
    color: colors.onBrandSecondary,
    fontFamily: typography.display,
    fontSize: 18,
    marginTop: 2,
  },
  metaDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.15)" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.md },
  grid: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  rowCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowTitle: {
    fontFamily: typography.textBold,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1.5,
  },
  stepperInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperInlineLabel: {
    fontFamily: typography.text,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    width: 56,
  },
  miniStepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  miniBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniValueWrap: { alignItems: "center", minWidth: 64 },
  miniValue: {
    fontFamily: typography.display,
    fontSize: 34,
    color: colors.onSurface,
    lineHeight: 36,
  },
  miniRel: { fontFamily: typography.textBold, fontSize: 11, color: colors.muted },
  statusBar: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  badgeText: { flex: 1, fontFamily: typography.textBold, fontSize: 12, lineHeight: 16 },
  errorText: { color: colors.error, fontFamily: typography.text, fontSize: 12 },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  prevBtn: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.55 },
  actionBtn: {
    flex: 1,
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 15,
    letterSpacing: 0.5,
  },
});
