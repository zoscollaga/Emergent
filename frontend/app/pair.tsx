import { useCallback, useEffect, useState } from "react";
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
import {
  createSession,
  getSession,
  joinSession,
} from "@/src/lib/api";
import {
  clearActiveSessionId,
  getDeviceId,
  getMemberId,
  setActiveSessionId,
  setMemberId,
} from "@/src/lib/storage";

type Mode = "menu" | "create" | "join" | "waiting";

const KEILOR_ID = "keilor";
const KEILOR_NAME = "Keilor Golf Course";

export default function PairSetup() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("menu");
  const [memberId, setLocalMemberId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [displayJoinCode, setDisplayJoinCode] = useState<string | null>(null);
  const [partnerMemberId, setPartnerMemberId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLocalMemberId(await getMemberId());
      setDeviceId(await getDeviceId());
    })();
  }, []);

  const persistMember = async (v: string) => {
    setLocalMemberId(v);
    if (/^\d{4}$/.test(v)) await setMemberId(v);
  };

  const startAsHost = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await createSession({
        device_id: deviceId,
        member_id: memberId,
        course_id: KEILOR_ID,
        course_name: KEILOR_NAME,
      });
      setSessionId(s.id);
      setDisplayJoinCode(s.join_code);
      await setActiveSessionId(s.id);
      setMode("waiting");
    } catch (e: any) {
      setError("Couldn't create session. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const startAsGuest = async () => {
    if (!/^\d{6}$/.test(joinCode.trim())) {
      setError("Join code must be 6 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const s = await joinSession(joinCode.trim(), {
        device_id: deviceId,
        member_id: memberId,
      });
      setSessionId(s.id);
      await setActiveSessionId(s.id);
      const partner = s.players.find((p) => p.device_id !== deviceId);
      setPartnerMemberId(partner?.member_id || null);
      setMode("waiting");
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("404")) setError("Join code not found. Double-check with your partner.");
      else if (msg.includes("409")) setError("This round is already full (2 players).");
      else setError("Couldn't join session. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  // Poll for partner to join
  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const s = await getSession(sessionId);
      const partner = s.players.find((p) => p.device_id !== deviceId);
      setPartnerMemberId(partner?.member_id || null);
      if (s.players.length === 2) {
        // Ready — auto-navigate briefly after showing "linked"
        setTimeout(() => router.replace({ pathname: "/pair-round", params: { sid: sessionId } }), 800);
      }
    } catch (e) {
      // swallow — keep polling
    }
  }, [sessionId, deviceId, router]);

  useEffect(() => {
    if (mode !== "waiting" || !sessionId) return;
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [mode, sessionId, refresh]);

  const cancel = async () => {
    await clearActiveSessionId();
    router.back();
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="pair-setup-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Pressable
            onPress={cancel}
            hitSlop={12}
            testID="pair-back-button"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Pair Scoring</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
          <View style={styles.memberCard}>
            <Text style={styles.label}>Your Member ID</Text>
            <TextInput
              testID="member-id-input"
              value={memberId}
              onChangeText={(v) => persistMember(v.replace(/\D/g, "").slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="0000"
              placeholderTextColor={colors.muted}
              style={styles.memberInput}
            />
          </View>

          {mode === "menu" && (
            <View style={{ gap: spacing.md }}>
              <Pressable
                onPress={startAsHost}
                disabled={busy || !/^\d{4}$/.test(memberId)}
                testID="pair-host-button"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (!/^\d{4}$/.test(memberId) || busy) && styles.btnDisabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={20} color={colors.onBrandPrimary} />
                    <Text style={styles.primaryBtnText}>Create round · Get code</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => setMode("join")}
                testID="pair-join-mode-button"
                style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="enter-outline" size={20} color={colors.brand} />
                <Text style={styles.secondaryBtnText}>Join with a code</Text>
              </Pressable>
            </View>
          )}

          {mode === "join" && (
            <View style={{ gap: spacing.md }}>
              <View>
                <Text style={styles.label}>Join code</Text>
                <TextInput
                  testID="join-code-input"
                  value={joinCode}
                  onChangeText={(v) => setJoinCode(v.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                  placeholderTextColor={colors.muted}
                  style={styles.codeInput}
                />
              </View>
              <Pressable
                onPress={startAsGuest}
                disabled={busy}
                testID="pair-join-submit-button"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  busy && styles.btnDisabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <Ionicons name="link" size={20} color={colors.onBrandPrimary} />
                    <Text style={styles.primaryBtnText}>Join round</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => setMode("menu")}
                style={({ pressed }) => [styles.tertiaryBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.tertiaryBtnText}>Back</Text>
              </Pressable>
            </View>
          )}

          {mode === "waiting" && (
            <View style={styles.waitCard} testID="pair-waiting">
              <Text style={styles.waitLabel}>SHARE THIS CODE</Text>
              <Text style={styles.joinCode} testID="join-code-display">
                {displayJoinCode ?? joinCode}
              </Text>
              <View style={styles.playersRow}>
                <PlayerPill label="You" value={memberId} filled />
                <Ionicons name="link" size={18} color={colors.muted} />
                <PlayerPill
                  label="Marker"
                  value={partnerMemberId}
                  filled={!!partnerMemberId}
                />
              </View>
              <Text style={styles.waitHint}>
                {partnerMemberId
                  ? `Linked. Starting round…`
                  : `Waiting for your marker to join…`}
              </Text>
              {!partnerMemberId && <ActivityIndicator color={colors.brand} />}
            </View>
          )}

          {error && (
            <View style={styles.errorBanner} testID="pair-error">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PlayerPill({
  label,
  value,
  filled,
}: {
  label: string;
  value: string | null;
  filled: boolean;
}) {
  return (
    <View style={[styles.pill, filled ? styles.pillFilled : styles.pillEmpty]}>
      <Text style={[styles.pillLabel, filled && { color: "#A7F3D0" }]}>{label}</Text>
      <Text style={[styles.pillValue, filled && { color: colors.onBrandSecondary }]}>
        {value || "----"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: typography.display, fontSize: 22, color: colors.onSurface },
  label: {
    fontFamily: typography.textBold,
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  memberCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  memberInput: {
    fontFamily: typography.display,
    fontSize: 40,
    color: colors.onSurface,
    letterSpacing: 8,
    paddingVertical: 4,
  },
  hint: { color: colors.muted, fontFamily: typography.text, fontSize: 12, marginTop: 4 },
  codeInput: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    fontFamily: typography.display,
    fontSize: 40,
    color: colors.onSurface,
    letterSpacing: 12,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  primaryBtn: {
    backgroundColor: colors.brandPrimary,
    height: 60,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  secondaryBtn: {
    height: 60,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtnText: {
    color: colors.brand,
    fontFamily: typography.textBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  tertiaryBtn: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  tertiaryBtnText: { color: colors.muted, fontFamily: typography.textBold, fontSize: 14 },
  btnDisabled: { backgroundColor: colors.borderStrong },
  waitCard: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  waitLabel: {
    color: "#A7F3D0",
    fontFamily: typography.text,
    fontSize: 11,
    letterSpacing: 2,
  },
  joinCode: {
    color: colors.onBrandSecondary,
    fontFamily: typography.display,
    fontSize: 56,
    letterSpacing: 8,
  },
  playersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    minWidth: 100,
  },
  pillFilled: { backgroundColor: "rgba(255,255,255,0.14)" },
  pillEmpty: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed" },
  pillLabel: { fontFamily: typography.text, fontSize: 10, letterSpacing: 1, color: "#A7F3D0" },
  pillValue: {
    fontFamily: typography.display,
    fontSize: 20,
    color: colors.onBrandSecondary,
    marginTop: 2,
    letterSpacing: 2,
  },
  waitHint: {
    color: "#D1FAE5",
    fontFamily: typography.text,
    fontSize: 13,
    textAlign: "center",
  },
  errorBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorBannerText: { flex: 1, color: "#991B1B", fontFamily: typography.text, fontSize: 13 },
});
