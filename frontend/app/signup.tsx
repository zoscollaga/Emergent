import { useState } from "react";
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
import { useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import { signUpStart, Member } from "@/src/lib/members";
import { getMembersWebhook, setIdentifiedMember } from "@/src/lib/storage";

export default function SignUpScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [handicap, setHandicap] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{
    kind: "error" | "duplicate" | "success";
    message: string;
    hint?: string;
    match_field?: string;
    member?: Member;
  } | null>(null);

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    /^[0-9+\s-]{8,}$/.test(mobile.trim()) &&
    handicap.trim().length > 0 &&
    Number.isFinite(Number(handicap));

  const setAsMe = async (m: Member) => {
    await setIdentifiedMember({
      member_id: m.member_id,
      first_name: m.first_name,
      last_name: m.last_name,
      handicap: m.handicap,
      status: m.status,
      mobile: m.mobile,
    });
    router.replace("/");
  };

  const submit = async () => {
    setBanner(null);
    const url = await getMembersWebhook();
    if (!url) {
      setBanner({
        kind: "error",
        message: "Members sheet isn't connected yet.",
        hint: "Go to Members → ⚙️ and paste your Google Apps Script /exec URL first.",
      });
      return;
    }
    setSubmitting(true);
    const res = await signUpStart(url, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      mobile: mobile.trim(),
      handicap: Number(handicap),
    });
    setSubmitting(false);

    if (res.ok && "pending" in res && res.pending) {
      // Move on to the verify code screen
      router.push({
        pathname: "/verify-signup",
        params: { email: res.email },
      });
      return;
    }

    if (!res.ok && res.duplicate) {
      setBanner({
        kind: "duplicate",
        message: "You're already registered.",
        hint: `A member with this ${res.match_field} exists.`,
        match_field: res.match_field,
        member: res.member,
      });
      return;
    }

    // Hard error
    if (!res.ok) {
      let msg = `Sign-up failed (HTTP ${res.status}).`;
      let hint: string | undefined;
      if (res.status === 0) {
        msg = "Network error.";
        hint = "Check your connection and the Members webhook URL.";
      } else if (res.status === 404) {
        hint = "Your Members webhook returned 404. Redeploy the Apps Script Web app and update the URL in Members → ⚙️.";
      } else if (res.status === 401 || res.status === 403) {
        hint = "Deployment access must be set to Anyone.";
      } else {
        hint = res.message;
      }
      setBanner({ kind: "error", message: msg, hint });
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="signup-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          testID="signup-back-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Sign up</Text>
          <Text style={styles.subtitle}>New to the club? Add yourself to the members roster.</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          <Field
            label="First name"
            value={firstName}
            onChange={setFirstName}
            testID="signup-first-name"
            autoCapitalize="words"
          />
          <Field
            label="Last name"
            value={lastName}
            onChange={setLastName}
            testID="signup-last-name"
            autoCapitalize="words"
          />
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            testID="signup-email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Mobile"
            value={mobile}
            onChange={setMobile}
            testID="signup-mobile"
            keyboardType="phone-pad"
          />
          <Field
            label="Handicap"
            value={handicap}
            onChange={setHandicap}
            testID="signup-handicap"
            keyboardType="numbers-and-punctuation"
          />

          {banner && (
            <View
              style={[
                styles.banner,
                banner.kind === "error" && styles.bannerError,
                banner.kind === "duplicate" && styles.bannerWarn,
                banner.kind === "success" && styles.bannerSuccess,
              ]}
              testID={`signup-banner-${banner.kind}`}
            >
              <Ionicons
                name={
                  banner.kind === "error"
                    ? "alert-circle"
                    : banner.kind === "duplicate"
                    ? "information-circle"
                    : "checkmark-circle"
                }
                size={18}
                color={
                  banner.kind === "error"
                    ? colors.error
                    : banner.kind === "duplicate"
                    ? "#92400E"
                    : colors.success
                }
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.bannerTitle,
                    banner.kind === "error" && { color: "#991B1B" },
                    banner.kind === "duplicate" && { color: "#92400E" },
                    banner.kind === "success" && { color: colors.brand },
                  ]}
                  testID="signup-banner-message"
                >
                  {banner.message}
                </Text>
                {banner.hint && (
                  <Text
                    style={[
                      styles.bannerHint,
                      banner.kind === "error" && { color: "#991B1B" },
                      banner.kind === "duplicate" && { color: "#92400E" },
                      banner.kind === "success" && { color: colors.brand },
                    ]}
                  >
                    {banner.hint}
                  </Text>
                )}
                {banner.kind === "duplicate" && banner.member && (
                  <View style={styles.dupCard}>
                    <View style={styles.dupCardLeft}>
                      <Text style={styles.dupName}>
                        {banner.member.first_name} {banner.member.last_name}
                      </Text>
                      <Text style={styles.dupMeta}>
                        #{banner.member.member_id || "—"} · HCP{" "}
                        {banner.member.handicap == null ? "—" : banner.member.handicap}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => banner.member && setAsMe(banner.member)}
                      testID="signup-use-existing"
                      style={({ pressed }) => [styles.useMeBtn, pressed && { opacity: 0.85 }]}
                    >
                      <Text style={styles.useMeBtnText}>This is me</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={submit}
            disabled={!canSubmit || submitting}
            testID="signup-submit-button"
            style={({ pressed }) => [
              styles.submitBtn,
              (!canSubmit || submitting) && styles.submitBtnDisabled,
              pressed && canSubmit && !submitting && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons name="person-add" size={20} color={colors.onBrandPrimary} />
                <Text style={styles.submitBtnText}>SIGN UP</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  testID,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testID: string;
  keyboardType?: any;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        style={styles.input}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholderTextColor={colors.muted}
      />
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
  title: { fontFamily: typography.display, fontSize: 24, color: colors.onSurface },
  subtitle: { fontFamily: typography.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  form: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  fieldLabel: {
    fontFamily: typography.textBold,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontFamily: typography.text,
    fontSize: 16,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  banner: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  bannerError: { backgroundColor: "#FEE2E2" },
  bannerWarn: { backgroundColor: "#FEF3C7" },
  bannerSuccess: { backgroundColor: colors.brandTertiary },
  bannerTitle: { fontFamily: typography.textBold, fontSize: 14 },
  bannerHint: { fontFamily: typography.text, fontSize: 12, marginTop: 4, lineHeight: 16 },
  dupCard: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  dupCardLeft: { flex: 1 },
  dupName: { fontFamily: typography.textBold, fontSize: 15, color: colors.onSurface },
  dupMeta: { fontFamily: typography.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  useMeBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  useMeBtnText: { color: colors.onBrandSecondary, fontFamily: typography.textBold, fontSize: 13 },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  submitBtn: {
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
});
