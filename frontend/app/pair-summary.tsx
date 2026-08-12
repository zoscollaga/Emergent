import { useCallback, useEffect, useMemo, useState } from "react";
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
  finishSession,
  getSession,
} from "@/src/lib/api";
import { fetchMembers, Member } from "@/src/lib/members";
import {
  clearActiveSessionId,
  getDeviceId,
  getWebhookUrl,
  isRoundExported,
  markRoundExported,
} from "@/src/lib/storage";
import {
  buildPlayerCsv,
  exportPlayerCardToSheet,
  formatFilename,
} from "@/src/lib/sheets";

type ExportState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success" }
  | { kind: "error"; message: string; hint?: string; details?: string }
  | { kind: "no_webhook" };

export default function PairSummary() {
  const router = useRouter();
  const { sid } = useLocalSearchParams<{ sid?: string }>();
  const [deviceId, setDeviceId] = useState("");
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportState, setExportState] = useState<ExportState>({ kind: "idle" });
  const [alreadyExported, setAlreadyExported] = useState(false);
  const [partnerMember, setPartnerMember] = useState<Member | null>(null);

  useEffect(() => {
    (async () => {
      setDeviceId(await getDeviceId());
    })();
  }, []);

  const load = useCallback(async () => {
    if (!sid) return;
    try {
      const s = await getSession(String(sid));
      setSession(s);
      if (!s.finished_at) {
        await finishSession(String(sid)).catch(() => {});
      }
      setAlreadyExported(await isRoundExported(String(sid)));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sid]);

  useEffect(() => {
    load();
  }, [load]);

  const me = session?.players.find((p) => p.device_id === deviceId) || null;
  const partner = session?.players.find((p) => p.device_id !== deviceId) || null;

  // Load partner's full name and handicap from the Web App
  useEffect(() => {
    if (!partner?.member_id || partnerMember?.member_id === partner.member_id) return;
    (async () => {
      const url = await getWebhookUrl();
      if (!url) return;
      const res = await fetchMembers(url);
      if (res.ok) {
        const target = String(partner.member_id).trim();
        const found = res.members.find((m) => String(m.member_id).trim() === target);
        if (found) setPartnerMember(found);
      }
    })();
  }, [partner?.member_id, partnerMember?.member_id]);

  const partnerMemberFullName = (_mid: string): string => {
    if (!partnerMember) return "";
    return `${partnerMember.first_name} ${partnerMember.last_name}`.trim();
  };
  const partnerHandicap = partnerMember?.handicap ?? null;

  // Build the partner's verified card from THIS device's marker entries
  const partnerCard = useMemo(() => {
    if (!session || !partner) return null;
    const myEntriesByHole = new Map(
      session.hole_entries
        .filter((e) => e.device_id === deviceId)
        .map((e) => [e.hole_number, e]),
    );
    const holes = session.holes.map((h) => {
      const e = myEntriesByHole.get(h.number);
      return {
        number: h.number,
        par: h.par,
        score: e?.marker_score ?? null, // partner's score = my marker value for them
        putts: e?.marker_putts ?? null,
      };
    });
    const total_score = holes.reduce((s, h) => s + (h.score || 0), 0);
    const total_putts = holes.reduce((s, h) => s + (h.putts || 0), 0);
    return { holes, total_score, total_putts };
  }, [session, partner, deviceId]);

  // Also build my own card (Player values from my own submissions) — for the summary display
  const myCard = useMemo(() => {
    if (!session || !me) return null;
    const myEntriesByHole = new Map(
      session.hole_entries
        .filter((e) => e.device_id === deviceId)
        .map((e) => [e.hole_number, e]),
    );
    const holes = session.holes.map((h) => {
      const e = myEntriesByHole.get(h.number);
      return {
        number: h.number,
        par: h.par,
        score: e?.player_score ?? null,
        putts: e?.player_putts ?? null,
      };
    });
    const total_score = holes.reduce((s, h) => s + (h.score || 0), 0);
    const total_putts = holes.reduce((s, h) => s + (h.putts || 0), 0);
    return { holes, total_score, total_putts };
  }, [session, me, deviceId]);

  const performExport = async (webhookUrl: string) => {
    if (!session || !partner || !partnerCard) return;
    setExportState({ kind: "sending" });
    Haptics.selectionAsync().catch(() => {});
    const filename = formatFilename(
      partner.member_id,
      session.started_at,
      session.course_short_id,
    );
    // Reuse previously-assigned Scorecard ID if we've exported this round before,
    // so edits update the same row instead of creating a duplicate.
    const key = `scId::${session.id}::${partner.member_id}`;
    const priorId = (await import("@react-native-async-storage/async-storage")).default.getItem
      ? await (await import("@react-native-async-storage/async-storage")).default.getItem(key)
      : null;
    const playerName = partnerMemberFullName(partner.member_id) || partner.member_id;
    const csv = buildPlayerCsv({
      scorecardId: priorId || undefined,
      playerName,
      memberId: partner.member_id,
      startedAt: session.started_at,
      courseName: session.course_name,
      grossScore: partnerCard.total_score,
      handicap: partnerHandicap,
      totalPutts: partnerCard.total_putts,
      holes: partnerCard.holes,
    });
    const result = await exportPlayerCardToSheet(webhookUrl, csv, filename, {
      session_id: session.id,
      player_member_id: partner.member_id,
      marker_member_id: me?.member_id ?? "",
      course_short_id: session.course_short_id,
      scorecard_id: priorId || "",
    });
    if (result.ok) {
      if (result.scorecard_id) {
        const AS = (await import("@react-native-async-storage/async-storage")).default;
        await AS.setItem(key, result.scorecard_id);
      }
      await markRoundExported(String(sid));
      setAlreadyExported(true);
      setExportState({ kind: "success" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      const msg =
        result.status === 0
          ? "Network error. Check your webhook URL and connection."
          : `Sheet rejected the request (HTTP ${result.status}).`;
      setExportState({
        kind: "error",
        message: msg,
        details: result.message,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const onSubmitCard = async () => {
    if (!partner) return;
    const stored = await getWebhookUrl();
    if (!stored) {
      setExportState({ kind: "no_webhook" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    performExport(stored);
  };

  const goHome = async () => {
    await clearActiveSessionId();
    router.replace("/");
  };

  if (loading || !session) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const totalPar = session.holes.reduce((s, h) => s + h.par, 0);
  const myDiff = myCard ? myCard.total_score - totalPar : 0;
  const myDiffLabel = myCard
    ? myDiff === 0
      ? "E"
      : myDiff > 0
      ? `+${myDiff}`
      : `${myDiff}`
    : "";
  const partnerDiff = partnerCard ? partnerCard.total_score - totalPar : 0;
  const partnerDiffLabel = partnerCard
    ? partnerDiff === 0
      ? "E"
      : partnerDiff > 0
      ? `+${partnerDiff}`
      : `${partnerDiff}`
    : "";

  const previewFilename = partner
    ? formatFilename(partner.member_id, session.started_at, session.course_short_id)
    : "";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="pair-summary-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Round Summary</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{session.course_name}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.cardsRow}>
          <PlayerCard
            heading="YOU"
            memberId={me?.member_id ?? "----"}
            total={myCard?.total_score ?? 0}
            putts={myCard?.total_putts ?? 0}
            diff={myDiffLabel}
            testID="you-card"
          />
          <PlayerCard
            heading="MARKER"
            memberId={partner?.member_id ?? "----"}
            total={partnerCard?.total_score ?? 0}
            putts={partnerCard?.total_putts ?? 0}
            diff={partnerDiffLabel}
            testID="marker-card"
            variant="filled"
          />
        </View>

        <View style={styles.exportInfo}>
          <Ionicons name="cloud-upload-outline" size={16} color={colors.brand} />
          <Text style={styles.exportInfoText}>
            Will add a row to the{" "}
            <Text style={{ fontFamily: typography.textBold }}>{previewFilename}</Text>
            {" "}tab for player{" "}
            <Text style={{ fontFamily: typography.textBold }}>{partner?.member_id ?? "----"}</Text>.
          </Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.thText, { flex: 1 }]}>Hole</Text>
          <Text style={[styles.thText, styles.tCol]}>Par</Text>
          <Text style={[styles.thText, styles.tCol]}>You</Text>
          <Text style={[styles.thText, styles.tCol]}>Marker</Text>
        </View>

        {session.holes.map((h) => {
          const mine = myCard?.holes.find((x) => x.number === h.number);
          const partnerH = partnerCard?.holes.find((x) => x.number === h.number);
          return (
            <View key={h.number} style={styles.tr} testID={`pair-summary-row-${h.number}`}>
              <Text style={[styles.tdText, { flex: 1 }]}>{h.number}</Text>
              <Text style={[styles.tdText, styles.tCol]}>{h.par}</Text>
              <ScoreCell value={mine?.score ?? null} diff={mine?.score != null ? mine.score - h.par : null} />
              <ScoreCell value={partnerH?.score ?? null} diff={partnerH?.score != null ? partnerH.score - h.par : null} />
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        {exportState.kind === "no_webhook" && (
          <Pressable
            onPress={() => router.push("/settings")}
            testID="export-no-webhook-banner"
            style={({ pressed }) => [styles.warnBanner, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="settings-outline" size={16} color="#92400E" />
            <Text style={styles.warnBannerText}>
              No Web App URL saved yet. Tap to open Settings and add one.
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#92400E" />
          </Pressable>
        )}
        {exportState.kind === "error" && (
          <View style={styles.errorBanner} testID="export-error-banner">
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorBannerText} testID="export-error-message">
                {exportState.message}
              </Text>
              {exportState.hint && (
                <Text style={styles.errorHintText} testID="export-error-hint">
                  {exportState.hint}
                </Text>
              )}
              {exportState.details && (
                <Text style={styles.errorDetailsText} testID="export-error-details" numberOfLines={4}>
                  Server said: {exportState.details}
                </Text>
              )}
            </View>
          </View>
        )}
        {exportState.kind === "success" && (
          <View style={styles.successBanner} testID="export-success-banner">
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.successBannerText}>
              Marker{"\u2019"}s card exported to your Google Sheet.
            </Text>
          </View>
        )}

        <View style={styles.footerButtons}>
          <Pressable
            onPress={goHome}
            testID="pair-summary-home-button"
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.secondaryBtnText}>Home</Text>
          </Pressable>
          <Pressable
            onPress={onSubmitCard}
            disabled={exportState.kind === "sending"}
            testID="submit-card-button"
            style={({ pressed }) => [
              styles.endRoundBtn,
              alreadyExported && { backgroundColor: colors.success },
              pressed && { opacity: 0.85 },
            ]}
          >
            {exportState.kind === "sending" ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons
                  name={alreadyExported ? "checkmark-done" : "cloud-upload"}
                  size={20}
                  color={colors.onBrandPrimary}
                />
                <Text style={styles.endRoundBtnText}>
                  {alreadyExported ? "SUBMIT AGAIN" : "SUBMIT MARKER\u2019S CARD"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

    </SafeAreaView>
  );
}

function PlayerCard({
  heading,
  memberId,
  total,
  putts,
  diff,
  testID,
  variant,
}: {
  heading: string;
  memberId: string;
  total: number;
  putts: number;
  diff: string;
  testID?: string;
  variant?: "filled" | "outlined";
}) {
  const isFilled = variant === "filled";
  return (
    <View
      testID={testID}
      style={[
        styles.playerCard,
        isFilled ? styles.playerCardFilled : styles.playerCardOutlined,
      ]}
    >
      <Text style={[styles.playerCardEyebrow, isFilled && { color: "#A7F3D0" }]}>{heading}</Text>
      <Text style={[styles.playerCardMember, isFilled && { color: colors.onBrandSecondary }]}>
        {memberId}
      </Text>
      <Text style={[styles.playerCardTotal, isFilled && { color: colors.onBrandSecondary }]}>
        {total}
      </Text>
      <Text style={[styles.playerCardMeta, isFilled && { color: "#D1FAE5" }]}>
        {diff} · {putts} putts
      </Text>
    </View>
  );
}

function ScoreCell({ value, diff }: { value: number | null; diff: number | null }) {
  const c = getScoreColor(diff);
  return (
    <View style={[styles.tCol, { alignItems: "center" }]}>
      <View style={[styles.scoreChip, { backgroundColor: c.bg }]}>
        <Text style={[styles.scoreChipText, { color: c.fg }]}>{value ?? "-"}</Text>
      </View>
    </View>
  );
}

function getScoreColor(diff: number | null): { bg: string; fg: string } {
  if (diff == null) return { bg: colors.surfaceSecondary, fg: colors.onSurface };
  if (diff <= -2) return { bg: "#FEF3C7", fg: "#92400E" };
  if (diff === -1) return { bg: colors.brandTertiary, fg: colors.brand };
  if (diff === 0) return { bg: colors.surfaceSecondary, fg: colors.onSurface };
  if (diff === 1) return { bg: "#FEE2E2", fg: "#991B1B" };
  return { bg: "#FCA5A5", fg: "#7F1D1D" };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.onSurface },
  subtitle: { fontFamily: typography.text, fontSize: 13, color: colors.muted, marginTop: 2 },
  cardsRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  playerCard: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "flex-start",
    gap: 2,
  },
  playerCardFilled: { backgroundColor: colors.brand },
  playerCardOutlined: { backgroundColor: colors.surfaceSecondary },
  playerCardEyebrow: {
    fontFamily: typography.text,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 2,
  },
  playerCardMember: {
    fontFamily: typography.textBold,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    letterSpacing: 2,
  },
  playerCardTotal: {
    fontFamily: typography.display,
    fontSize: 40,
    color: colors.onSurface,
    marginTop: 4,
  },
  playerCardMeta: {
    fontFamily: typography.text,
    fontSize: 12,
    color: colors.muted,
  },
  exportInfo: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.brandTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  exportInfoText: { flex: 1, fontFamily: typography.text, color: colors.brand, fontSize: 12, lineHeight: 16 },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceSecondary,
  },
  tCol: { width: 62, textAlign: "center" },
  thText: {
    fontFamily: typography.textBold,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tdText: { fontFamily: typography.text, fontSize: 15, color: colors.onSurface, textAlign: "center" },
  scoreChip: {
    minWidth: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreChipText: { fontFamily: typography.textBold, fontSize: 14 },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  footerButtons: { flexDirection: "row", gap: spacing.md },
  secondaryBtn: {
    flex: 1,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: colors.onSurface, fontFamily: typography.textBold, fontSize: 14 },
  endRoundBtn: {
    flex: 1.9,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  endRoundBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  errorBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errorBannerText: { color: "#991B1B", fontFamily: typography.textBold, fontSize: 13 },
  errorHintText: { marginTop: 4, color: "#991B1B", fontFamily: typography.text, fontSize: 12, lineHeight: 16 },
  errorDetailsText: { marginTop: 6, color: "#7F1D1D", fontFamily: typography.text, fontSize: 11, lineHeight: 14 },
  successBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.brandTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  successBannerText: { flex: 1, color: colors.brand, fontFamily: typography.textBold, fontSize: 12 },

  warnBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  warnBannerText: {
    flex: 1,
    color: "#92400E",
    fontFamily: typography.textBold,
    fontSize: 13,
    lineHeight: 17,
  },
});
