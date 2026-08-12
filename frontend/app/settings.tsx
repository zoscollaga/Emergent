import { useEffect, useState } from "react";
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
import {
  clearWebhookUrl,
  getDefaultWebhookUrl,
  getWebhookOverride,
  getWebhookUrl,
  setWebhookUrl,
} from "@/src/lib/storage";
import { fetchMembers } from "@/src/lib/members";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; count: number }
  | { kind: "error"; message: string };

const URL_REGEX = /^https:\/\/script\.google(usercontent)?\.com\//i;
const EXEC_REGEX = /\/(exec|dev)(\?.*)?$/i;

export default function SettingsScreen() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [defaultUrl, setDefaultUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  useEffect(() => {
    (async () => {
      const current = await getWebhookUrl();
      const ovr = await getWebhookOverride();
      const def = getDefaultWebhookUrl();
      setSavedUrl(current);
      setOverride(ovr);
      setDefaultUrl(def);
      setUrl(current || "");
    })();
  }, []);

  const validate = (candidate: string): string | null => {
    if (!URL_REGEX.test(candidate)) {
      return "Must be an Apps Script URL starting with https://script.google.com/";
    }
    if (!EXEC_REGEX.test(candidate)) {
      return "URL is missing /exec. Open Apps Script → Deploy → Manage deployments and copy the Web app URL.";
    }
    return null;
  };

  const onSave = async () => {
    const candidate = url.trim();
    const err = validate(candidate);
    if (err) {
      setValidationError(err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    setValidationError(null);
    setSaving(true);
    await setWebhookUrl(candidate);
    setSavedUrl(candidate);
    setOverride(candidate);
    setSaving(false);
    setTest({ kind: "idle" });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const onTest = async () => {
    const candidate = url.trim();
    const err = validate(candidate);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setTest({ kind: "testing" });
    const res = await fetchMembers(candidate);
    if (res.ok) {
      setTest({ kind: "ok", count: res.members.length });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      let message = `HTTP ${res.status}. ${res.message || ""}`.trim();
      if (res.status === 0) message = "Network error. Check your internet connection.";
      else if (res.status === 404) message = "404 — the URL is wrong or the deployment is missing. Copy the current .../exec URL from Apps Script → Deploy → Manage deployments.";
      else if (res.status === 401 || res.status === 403) message = "Access denied. In Apps Script deploy settings set Access = Anyone.";
      setTest({ kind: "error", message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const onClear = async () => {
    await clearWebhookUrl();
    setOverride(null);
    // If a shipped default exists, reflect it as the "current" URL.
    const fallback = getDefaultWebhookUrl() || null;
    setSavedUrl(fallback);
    setUrl(fallback || "");
    setTest({ kind: "idle" });
    setValidationError(null);
  };

  const dirty = (url.trim() || null) !== (savedUrl || null);
  const usingDefault = !override && !!defaultUrl && savedUrl === defaultUrl;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="settings-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          testID="settings-back-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Google Sheets connection</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Web App URL</Text>
            <Text style={styles.cardBody}>
              One URL powers Members, Scorecard exports, and the Live Leaderboard.
              {usingDefault ? " Your device is using the club's default URL." : ""}
            </Text>
            {usingDefault && (
              <View style={[styles.banner, styles.bannerNeutral]} testID="webhook-default-banner">
                <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
                <Text style={[styles.bannerText, { color: colors.brand }]}>
                  Auto-connected via club default. Override below only if you need to test a different sheet.
                </Text>
              </View>
            )}

            <TextInput
              testID="webhook-url-input"
              value={url}
              onChangeText={(v) => {
                setUrl(v);
                if (validationError) setValidationError(null);
                if (test.kind !== "idle") setTest({ kind: "idle" });
              }}
              placeholder="https://script.google.com/macros/s/…/exec"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.urlInput}
              multiline
            />

            {validationError && (
              <Text style={styles.formError} testID="webhook-validation-error">
                {validationError}
              </Text>
            )}

            {test.kind === "ok" && (
              <View style={[styles.banner, styles.bannerOk]} testID="webhook-test-ok">
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[styles.bannerText, { color: colors.brand }]}>
                  Connected. Loaded {test.count} members.
                </Text>
              </View>
            )}
            {test.kind === "error" && (
              <View style={[styles.banner, styles.bannerErr]} testID="webhook-test-error">
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={[styles.bannerText, { color: "#991B1B" }]}>{test.message}</Text>
              </View>
            )}
            {savedUrl && !dirty && test.kind === "idle" && (
              <View style={[styles.banner, styles.bannerNeutral]}>
                <Ionicons name="link" size={16} color={colors.onSurfaceSecondary} />
                <Text style={[styles.bannerText, { color: colors.onSurfaceSecondary }]}>
                  Saved. Tap Test to confirm the connection works.
                </Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <Pressable
                onPress={onTest}
                disabled={!url.trim() || test.kind === "testing"}
                testID="webhook-test-button"
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  (!url.trim() || test.kind === "testing") && styles.btnDisabled,
                  pressed && url.trim() && test.kind !== "testing" && { opacity: 0.7 },
                ]}
              >
                {test.kind === "testing" ? (
                  <ActivityIndicator color={colors.onSurface} />
                ) : (
                  <>
                    <Ionicons name="cellular" size={16} color={colors.onSurface} />
                    <Text style={styles.secondaryBtnText}>Test</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={onSave}
                disabled={!dirty || saving}
                testID="webhook-save-button"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (!dirty || saving) && styles.btnDisabled,
                  pressed && dirty && !saving && { opacity: 0.85 },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <Ionicons name="save" size={16} color={colors.onBrandPrimary} />
                    <Text style={styles.primaryBtnText}>Save</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>How to get your URL</Text>
            <Step number="1" text="Open your Google Sheet (or create one)." />
            <Step number="2" text="Extensions → Apps Script. Paste the club script and Save." />
            <Step
              number="3"
              text="Deploy → New deployment → Web app → Execute as: Me · Access: Anyone. Copy the .../exec URL and paste it above."
            />
            <Step
              number="4"
              text="Later, if you change the script: Deploy → Manage deployments → Edit → Version: New version → Deploy. Keep the same URL."
            />
          </View>

          {override && (
            <Pressable
              onPress={onClear}
              testID="webhook-clear-button"
              style={({ pressed }) => [styles.dangerLink, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="trash-outline" size={14} color={colors.error} />
              <Text style={styles.dangerLinkText}>
                {defaultUrl ? "Remove override & use club default" : "Remove saved URL"}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Step({ number, text }: { number: string; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
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
  title: { fontFamily: typography.display, fontSize: 26, color: colors.onSurface },
  subtitle: { fontFamily: typography.text, fontSize: 13, color: colors.muted, marginTop: 2 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    fontFamily: typography.textBold,
    fontSize: 15,
    color: colors.onSurface,
    letterSpacing: 0.3,
  },
  cardBody: {
    fontFamily: typography.text,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 19,
  },
  urlInput: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: typography.text,
    fontSize: 13,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  formError: { color: colors.error, fontFamily: typography.text, fontSize: 12 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  bannerOk: { backgroundColor: colors.brandTertiary },
  bannerErr: { backgroundColor: "#FEE2E2" },
  bannerNeutral: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bannerText: { flex: 1, fontFamily: typography.textBold, fontSize: 12, lineHeight: 16 },
  actionsRow: { flexDirection: "row", gap: spacing.md },
  secondaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtnText: {
    color: colors.onSurface,
    fontFamily: typography.textBold,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  primaryBtn: {
    flex: 1.4,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  btnDisabled: { opacity: 0.5 },
  stepRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepBadgeText: {
    color: colors.onBrandSecondary,
    fontFamily: typography.textBold,
    fontSize: 11,
  },
  stepText: {
    flex: 1,
    fontFamily: typography.text,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 19,
  },
  dangerLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
  },
  dangerLinkText: {
    color: colors.error,
    fontFamily: typography.textBold,
    fontSize: 13,
  },
});
