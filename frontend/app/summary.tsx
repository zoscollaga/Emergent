import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { useLocalSearchParams, useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import {
  FinishedRound,
  StoredCourse,
  getRoundHistory,
  getSelectedCourse,
  getSheetsWebhook,
  isRoundExported,
  markRoundExported,
  setSheetsWebhook,
} from "@/src/lib/storage";
import { exportToGoogleSheet } from "@/src/lib/sheets";

type ExportState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success"; when: number }
  | { kind: "error"; message: string };

export default function SummaryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [round, setRound] = useState<FinishedRound | null>(null);
  const [course, setCourse] = useState<StoredCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyExported, setAlreadyExported] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ kind: "idle" });
  const [showSetup, setShowSetup] = useState(false);
  const [webhookInput, setWebhookInput] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const list = await getRoundHistory();
      const target = id ? list.find((r) => r.id === id) : list[0];
      setRound(target || null);
      const c = await getSelectedCourse();
      setCourse(c);
      if (target) {
        setAlreadyExported(await isRoundExported(target.id));
      }
      setLoading(false);
    })();
  }, [id]);

  const performExport = async (webhookUrl: string) => {
    if (!round) return;
    setExportState({ kind: "sending" });
    Haptics.selectionAsync().catch(() => {});
    const result = await exportToGoogleSheet(webhookUrl, round, course);
    if (result.ok) {
      await markRoundExported(round.id);
      setAlreadyExported(true);
      setExportState({ kind: "success", when: Date.now() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      const msg =
        result.status === 0
          ? "Network error. Check your webhook URL and connection."
          : `Sheet rejected the request (HTTP ${result.status}). Check your Apps Script.`;
      setExportState({ kind: "error", message: msg });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const onEndRound = async () => {
    if (!round) return;
    const stored = await getSheetsWebhook();
    if (!stored) {
      setWebhookInput("");
      setSetupError(null);
      setShowSetup(true);
      return;
    }
    performExport(stored);
  };

  const onSaveWebhook = async () => {
    const url = webhookInput.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\//i.test(url)) {
      setSetupError(
        "That doesn't look like an Apps Script web app URL. It should start with https://script.google.com/",
      );
      return;
    }
    setSetupError(null);
    await setSheetsWebhook(url);
    setShowSetup(false);
    performExport(url);
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!round) {
    return (
      <SafeAreaView style={[styles.root, styles.center]} edges={["top", "bottom"]}>
        <Text style={styles.emptyText}>No round found.</Text>
        <Pressable
          onPress={() => router.replace("/")}
          testID="summary-home-button"
          style={styles.doneBtn}
        >
          <Text style={styles.doneBtnText}>Back to home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const holePars = course?.holes || [];
  const totalPar = holePars.reduce((s, h) => s + h.par, 0);
  const diff = round.total_score - totalPar;
  const diffLabel = totalPar === 0 ? "" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="summary-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Round Summary</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{round.course_name}</Text>
        </View>
        <Pressable
          onPress={() => {
            (async () => {
              const stored = await getSheetsWebhook();
              setWebhookInput(stored || "");
              setSetupError(null);
              setShowSetup(true);
            })();
          }}
          hitSlop={12}
          testID="sheets-settings-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="settings-outline" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      <View style={styles.totalsCard}>
        <TotalCell
          label="Total Score"
          value={String(round.total_score)}
          sub={diffLabel ? `${diffLabel} vs par ${totalPar}` : undefined}
          testID="total-score"
        />
        <View style={styles.totalDivider} />
        <TotalCell
          label="Total Putts"
          value={String(round.total_putts)}
          testID="total-putts"
        />
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.thText, { flex: 1 }]}>Hole</Text>
        <Text style={[styles.thText, styles.tCol]}>Par</Text>
        <Text style={[styles.thText, styles.tCol]}>Score</Text>
        <Text style={[styles.thText, styles.tCol]}>Putts</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        style={{ flex: 1 }}
      >
        {round.holes.map((h) => {
          const par = holePars.find((x) => x.number === h.number)?.par ?? null;
          const scoreDiff =
            h.score != null && par != null ? h.score - par : null;
          const chipColor = getScoreColor(scoreDiff);
          return (
            <View key={h.number} style={styles.tr} testID={`summary-row-${h.number}`}>
              <Text style={[styles.tdText, { flex: 1 }]}>{h.number}</Text>
              <Text style={[styles.tdText, styles.tCol]}>{par ?? "-"}</Text>
              <View style={[styles.tCol, { alignItems: "center" }]}>
                <View style={[styles.scoreChip, { backgroundColor: chipColor.bg }]}>
                  <Text style={[styles.scoreChipText, { color: chipColor.fg }]}>
                    {h.score ?? "-"}
                  </Text>
                </View>
              </View>
              <Text style={[styles.tdText, styles.tCol]}>{h.putts ?? "-"}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        {exportState.kind === "error" && (
          <View style={styles.errorBanner} testID="export-error-banner">
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorBannerText}>{exportState.message}</Text>
          </View>
        )}
        {exportState.kind === "success" && (
          <View style={styles.successBanner} testID="export-success-banner">
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.successBannerText}>Scorecard sent to your Google Sheet.</Text>
          </View>
        )}

        <View style={styles.footerButtons}>
          <Pressable
            onPress={() => router.replace("/")}
            testID="summary-home-button"
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.secondaryBtnText}>Home</Text>
          </Pressable>
          <Pressable
            onPress={onEndRound}
            disabled={exportState.kind === "sending"}
            testID="end-round-button"
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
                  {alreadyExported ? "EXPORT AGAIN" : "END ROUND & EXPORT"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      <SetupModal
        visible={showSetup}
        value={webhookInput}
        onChange={setWebhookInput}
        onCancel={() => setShowSetup(false)}
        onSave={onSaveWebhook}
        error={setupError}
      />
    </SafeAreaView>
  );
}

function SetupModal({
  visible,
  value,
  onChange,
  onCancel,
  onSave,
  error,
}: {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
  error: string | null;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
    >
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ width: "100%" }}
        >
          <View style={styles.sheet} testID="sheets-setup-modal">
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetTitle}>Connect Google Sheet</Text>
            <Text style={styles.sheetBody}>
              1. Open a new Google Sheet.{"\n"}
              2. Extensions → Apps Script. Paste this and Save:
            </Text>
            <View style={styles.codeBlock}>
              <Text style={styles.codeText} selectable>
{`function doPost(e){
  const data = JSON.parse(e.postData.contents);
  const rows = Utilities.parseCsv(data.csv);
  const ss = SpreadsheetApp.getActive();
  const name = data.filename || 'Round';
  let sh = ss.getSheetByName(name);
  if (sh) sh.clear(); else sh = ss.insertSheet(name);
  sh.getRange(1,1,rows.length,rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  return ContentService.createTextOutput('ok');
}`}
              </Text>
            </View>
            <Text style={styles.sheetBody}>
              3. Deploy → New deployment → Web app → Execute as: Me, Access: Anyone.{"\n"}
              4. Copy the Web app URL and paste it below.
            </Text>
            <TextInput
              testID="sheets-webhook-input"
              value={value}
              onChangeText={onChange}
              placeholder="https://script.google.com/macros/s/…/exec"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.urlInput}
            />
            {error && <Text style={styles.formError}>{error}</Text>}
            <View style={styles.modalActions}>
              <Pressable
                onPress={onCancel}
                testID="sheets-setup-cancel"
                style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSave}
                testID="sheets-setup-save"
                style={({ pressed }) => [styles.endRoundBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.endRoundBtnText}>SAVE & EXPORT</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function TotalCell({
  label,
  value,
  sub,
  testID,
}: {
  label: string;
  value: string;
  sub?: string;
  testID?: string;
}) {
  return (
    <View style={styles.totalCell} testID={testID}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
      {sub && <Text style={styles.totalSub}>{sub}</Text>}
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
  title: { fontFamily: typography.display, fontSize: 26, color: colors.onSurface },
  subtitle: { fontFamily: typography.text, fontSize: 14, color: colors.muted, marginTop: 2 },
  totalsCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    flexDirection: "row",
    padding: spacing.xl,
    alignItems: "center",
  },
  totalCell: { flex: 1, alignItems: "center" },
  totalLabel: { color: "#A7F3D0", fontFamily: typography.text, fontSize: 12, letterSpacing: 1 },
  totalValue: {
    color: colors.onBrandSecondary,
    fontFamily: typography.display,
    fontSize: 44,
    marginTop: 6,
  },
  totalSub: { color: "#D1FAE5", fontFamily: typography.text, fontSize: 12, marginTop: 4 },
  totalDivider: { width: 1, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.15)" },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tCol: { width: 68, textAlign: "center" },
  thText: {
    fontFamily: typography.textBold,
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tdText: { fontFamily: typography.text, fontSize: 16, color: colors.onSurface, textAlign: "center" },
  scoreChip: {
    minWidth: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreChipText: { fontFamily: typography.textBold, fontSize: 15 },
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
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: colors.onSurface, fontFamily: typography.textBold, fontSize: 15 },
  endRoundBtn: {
    flex: 1.7,
    height: 62,
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
    fontSize: 14,
    letterSpacing: 1,
  },
  doneBtn: {
    height: 62,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  doneBtnText: { color: colors.onBrandPrimary, fontFamily: typography.textBold, fontSize: 16 },
  emptyText: { fontFamily: typography.text, color: colors.muted, marginBottom: spacing.lg },
  errorBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errorBannerText: { flex: 1, color: "#991B1B", fontFamily: typography.text, fontSize: 13 },
  successBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.brandTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  successBannerText: { flex: 1, color: colors.brand, fontFamily: typography.textBold, fontSize: 13 },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sheetGrabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  sheetTitle: { fontFamily: typography.display, fontSize: 22, color: colors.onSurface },
  sheetBody: { fontFamily: typography.text, color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  codeBlock: {
    backgroundColor: "#0F172A",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  codeText: {
    color: "#E2E8F0",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
    lineHeight: 16,
  },
  urlInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    fontFamily: typography.text,
    fontSize: 14,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  formError: { color: colors.error, fontFamily: typography.text, fontSize: 12 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
});
