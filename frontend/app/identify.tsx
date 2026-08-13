import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { fetchMembers, Member } from "@/src/lib/members";
import {
  clearWebhookUrl,
  getDefaultWebhookUrl,
  getIdentifiedMember,
  getWebhookOverride,
  getWebhookUrl,
  setIdentifiedMember,
} from "@/src/lib/storage";

export default function IdentifyScreen() {
  const router = useRouter();
  const [webhook, setWebhook] = useState<string | null>(null);
  const [webhookOverride, setWebhookOverrideState] = useState<string | null>(null);
  const [defaultWebhook, setDefaultWebhook] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [query, setQuery] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const url = await getWebhookUrl();
    const override = await getWebhookOverride();
    const def = getDefaultWebhookUrl();
    setWebhook(url);
    setWebhookOverrideState(override);
    setDefaultWebhook(def);
    const identified = await getIdentifiedMember();
    setCurrentId(identified?.member_id || null);
    if (!url) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetchMembers(url);
    if (res.ok) {
      // Current + Pending Approval members are pickable (Pending members can still play)
      const pickable = res.members
        .filter((m) => {
          const s = m.status.trim().toLowerCase();
          return s === "current" || s === "pending approval";
        })
        .sort((a, b) => {
          const l = a.last_name.localeCompare(b.last_name);
          return l !== 0 ? l : a.first_name.localeCompare(b.first_name);
        });
      setMembers(pickable);
    } else {
      let message = `Couldn't load members (HTTP ${res.status}).`;
      let hint: string | undefined;
      if (res.status === 0) {
        message = "Network error.";
        hint = "Check your internet connection and open Home \u2192 \u2699\ufe0f Settings to verify the Web App URL.";
      } else if (res.status === 404) {
        hint = override
          ? "This device has a custom Web App URL saved that no longer works. Tap 'Use club default' below to reset it, or open Settings to paste a fresh /exec URL."
          : "The Web App URL isn't reachable. Open Home \u2192 \u2699\ufe0f Settings to paste a fresh /exec URL (from Apps Script \u2192 Deploy \u2192 Manage deployments).";
      } else if (res.status === 401 || res.status === 403) {
        hint = "Deployment access must be set to Anyone. Update it in Apps Script and redeploy.";
      }
      setError({ message, hint });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Privacy: don't list the roster. Require at least 2 chars to start matching.
    if (q.length < 2) return [];
    return members.filter((m) => {
      const full = `${m.first_name} ${m.last_name}`.toLowerCase();
      return (
        full.includes(q) ||
        m.member_id.toLowerCase().includes(q) ||
        m.mobile.replace(/\s/g, "").includes(q)
      );
    });
  }, [members, query]);

  const onPick = async (m: Member) => {
    setPicking(m.member_id || `${m.first_name}-${m.last_name}`);
    await setIdentifiedMember({
      member_id: m.member_id,
      first_name: m.first_name,
      last_name: m.last_name,
      handicap: m.handicap,
      status: m.status,
      mobile: m.mobile,
    });
    router.back();
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="identify-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          testID="identify-back-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Who are you?</Text>
          <Text style={styles.subtitle}>Choose your name to record your rounds.</Text>
        </View>
      </View>

      {!webhook ? (
        <View style={styles.center}>
          <Ionicons name="link-outline" size={28} color={colors.brand} />
          <Text style={styles.hint}>
            Google Sheet isn{"\u2019"}t connected yet. Open Settings to paste the Web App URL.
          </Text>
          <Pressable
            onPress={() => router.replace("/settings")}
            testID="identify-open-settings"
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Open Settings</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.center} testID="identify-loading">
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.hint}>Loading members…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={28} color={colors.error} />
          <Text style={styles.errorText}>{error.message}</Text>
          {error.hint && <Text style={styles.errorHint}>{error.hint}</Text>}
          <View style={{ flexDirection: "row", gap: spacing.md, flexWrap: "wrap", justifyContent: "center" }}>
            {webhookOverride && defaultWebhook && webhookOverride !== defaultWebhook && (
              <Pressable
                onPress={async () => {
                  await clearWebhookUrl();
                  load();
                }}
                testID="identify-use-default"
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.primaryBtnText}>Use club default</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push("/settings")}
              testID="identify-open-settings"
              style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.secondaryBtnText}>Open Settings</Text>
            </Pressable>
            <Pressable onPress={load} style={styles.secondaryBtn} testID="identify-retry">
              <Text style={styles.secondaryBtnText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              testID="identify-search-input"
              value={query}
              onChangeText={setQuery}
              placeholder="Search name or ID"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="words"
              autoFocus
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={8} testID="identify-clear-search">
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>

          {query.trim().length < 2 ? (
            <View style={styles.center}>
              <Ionicons name="search" size={28} color={colors.borderStrong} />
              <Text style={styles.hint}>
                Type your name to find your card.{"\n"}
                For privacy the full roster isn{"\u2019"}t listed.
              </Text>
              <Pressable
                onPress={() => router.push("/signup")}
                testID="identify-signup-hint"
                style={({ pressed }) => [styles.signupFooter, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="person-add-outline" size={18} color={colors.brand} />
                <Text style={styles.signupFooterText}>Not on the list? Sign up</Text>
              </Pressable>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.hint}>No members match.</Text>
              <Pressable
                onPress={() => router.push("/signup")}
                testID="identify-signup-empty"
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Sign up as new member</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingBottom: spacing.xxxl }}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.map((m) => {
                const isMe = currentId === m.member_id && m.member_id !== "";
                const testID = `identify-pick-${m.member_id || m.last_name}`
                  .toLowerCase()
                  .replace(/\s+/g, "-");
                return (
                  <Pressable
                    key={testID}
                    onPress={() => onPick(m)}
                    disabled={picking !== null}
                    testID={testID}
                    style={({ pressed }) => [
                      styles.row,
                      isMe && styles.rowSelected,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <View style={[styles.avatar, isMe && styles.avatarSelected]}>
                      <Text style={[styles.avatarText, isMe && { color: colors.onBrandPrimary }]}>
                        {(m.first_name[0] || "?") + (m.last_name[0] || "")}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>
                          {m.first_name} {m.last_name}
                        </Text>
                        {m.member_id ? (
                          <View style={styles.idBadge}>
                            <Text style={styles.idBadgeText}>#{m.member_id}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.metaText}>
                        HCP {m.handicap == null ? "—" : m.handicap}
                      </Text>
                    </View>
                    {picking === (m.member_id || `${m.first_name}-${m.last_name}`) ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : isMe ? (
                      <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                    )}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => router.push("/signup")}
                testID="identify-signup-footer"
                style={({ pressed }) => [styles.signupFooter, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="person-add-outline" size={18} color={colors.brand} />
                <Text style={styles.signupFooterText}>Not on the list? Sign up</Text>
              </Pressable>
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
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
  searchWrap: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
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
  hint: { color: colors.muted, fontFamily: typography.text, textAlign: "center", lineHeight: 20 },
  errorText: { color: colors.error, fontFamily: typography.textBold, textAlign: "center" },
  errorHint: { color: colors.muted, fontFamily: typography.text, textAlign: "center", fontSize: 12 },
  primaryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    marginTop: spacing.md,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontFamily: typography.textBold },
  secondaryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: { color: colors.onSurface, fontFamily: typography.textBold },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowSelected: { backgroundColor: colors.brandTertiary },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSelected: { backgroundColor: colors.brand },
  avatarText: { fontFamily: typography.textBold, fontSize: 14, color: colors.brand },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontFamily: typography.textBold, fontSize: 16, color: colors.onSurface, flexShrink: 1 },
  idBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  idBadgeText: {
    fontFamily: typography.textBold,
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    letterSpacing: 0.5,
  },
  metaText: { color: colors.muted, fontFamily: typography.text, fontSize: 12, marginTop: 2 },
  signupFooter: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderStyle: "dashed",
  },
  signupFooterText: {
    color: colors.brand,
    fontFamily: typography.textBold,
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
