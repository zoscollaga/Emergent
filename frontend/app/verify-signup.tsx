import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import { signUpVerify } from "@/src/lib/members";
import { getWebhookUrl, setIdentifiedMember } from "@/src/lib/storage";

export default function VerifySignupScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const emailStr = String(email || "");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // autofocus
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const canSubmit = /^\d{6}$/.test(code) && !submitting;

  const verify = async () => {
    if (!canSubmit) return;
    setError(null);
    const url = await getWebhookUrl();
    if (!url) {
      setError("Google Sheet isn't connected. Open Home → ⚙️ Settings and paste the Web App URL.");
      return;
    }
    setSubmitting(true);
    const res = await signUpVerify(url, emailStr, code);
    setSubmitting(false);
    if (res.ok) {
      // Save identity and go home
      await setIdentifiedMember({
        member_id: res.member.member_id,
        first_name: res.member.first_name,
        last_name: res.member.last_name,
        handicap: res.member.handicap,
        status: res.member.status,
        mobile: res.member.mobile,
      });
      setSuccess(true);
      setTimeout(() => router.replace("/"), 1200);
      return;
    }
    setError(res.message || "That code didn't match. Please try again.");
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="verify-signup-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          testID="verify-back-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>Codes expire in 15 minutes.</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.body}>
          <View style={styles.emailPill} testID="verify-email-pill">
            <Ionicons name="mail" size={16} color={colors.brand} />
            <Text style={styles.emailPillText} numberOfLines={1}>{emailStr}</Text>
          </View>

          <Text style={styles.helperText}>
            Enter the 6-digit code we just emailed you.
          </Text>

          <TextInput
            ref={inputRef}
            testID="verify-code-input"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            placeholderTextColor={colors.borderStrong}
            style={styles.codeInput}
            maxLength={6}
          />

          {error && (
            <View style={styles.errorBanner} testID="verify-error">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {success && (
            <View style={styles.successBanner} testID="verify-success">
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.successText}>
                Verified! You{"\u2019"}re signed up pending admin approval. You can play in the meantime.
              </Text>
            </View>
          )}

          <Pressable
            onPress={verify}
            disabled={!canSubmit}
            testID="verify-submit-button"
            style={({ pressed }) => [
              styles.submitBtn,
              !canSubmit && styles.submitBtnDisabled,
              pressed && canSubmit && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={20} color={colors.onBrandPrimary} />
                <Text style={styles.submitBtnText}>VERIFY & SIGN UP</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.footerHint}>
            Didn{"\u2019"}t get an email? Check spam, or go back and re-submit to send a new code.
          </Text>
        </View>
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
  body: { flex: 1, padding: spacing.xl, gap: spacing.lg, alignItems: "stretch" },
  emailPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  emailPillText: {
    color: colors.brand,
    fontFamily: typography.textBold,
    fontSize: 14,
    maxWidth: 280,
  },
  helperText: {
    color: colors.muted,
    fontFamily: typography.text,
    fontSize: 13,
    textAlign: "center",
  },
  codeInput: {
    height: 80,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    fontFamily: typography.display,
    fontSize: 40,
    color: colors.onSurface,
    letterSpacing: 12,
    textAlign: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#FEE2E2",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { flex: 1, color: "#991B1B", fontFamily: typography.text, fontSize: 13 },
  successBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.brandTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  successText: { flex: 1, color: colors.brand, fontFamily: typography.textBold, fontSize: 13, lineHeight: 18 },
  submitBtn: {
    marginTop: spacing.md,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  submitBtnDisabled: { backgroundColor: colors.borderStrong },
  submitBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 16,
    letterSpacing: 1,
  },
  footerHint: {
    color: colors.muted,
    fontFamily: typography.text,
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
