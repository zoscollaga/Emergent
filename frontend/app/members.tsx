import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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
import { getWebhookUrl } from "@/src/lib/storage";

export default function MembersScreen() {
  const router = useRouter();
  const [webhook, setWebhook] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const useUrl = await getWebhookUrl();
    setWebhook(useUrl);
    if (!useUrl) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetchMembers(useUrl);
    if (res.ok) {
      // Sort by last name, then first
      setMembers(
        [...res.members].sort((a, b) => {
          const l = a.last_name.localeCompare(b.last_name);
          return l !== 0 ? l : a.first_name.localeCompare(b.first_name);
        }),
      );
    } else {
      let message = `Couldn't load members (HTTP ${res.status}).`;
      let hint: string | undefined;
      if (res.status === 0) {
        message = "Network error.";
        hint = "Check your internet connection and the Web App URL in Settings.";
      } else if (res.status === 404) {
        hint = "Open Apps Script → Deploy → Manage deployments and copy the current .../exec URL, then update it in Settings.";
      } else if (res.status === 401 || res.status === 403) {
        hint = "Deployment access must be set to Anyone (or ask your Workspace admin).";
      } else if (res.message?.startsWith("Response wasn't valid JSON")) {
        message = "Response wasn't valid JSON.";
        hint = "Make sure your doGet returns JSON via ContentService.";
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
    if (!q) return members;
    return members.filter((m) => {
      const full = `${m.first_name} ${m.last_name}`.toLowerCase();
      return (
        full.includes(q) ||
        m.mobile.replace(/\s/g, "").includes(q) ||
        m.member_id.toLowerCase().includes(q)
      );
    });
  }, [members, query]);

  const openSettings = () => router.push("/settings");

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="members-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          testID="members-back-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Members</Text>
          {members.length > 0 && (
            <Text style={styles.subtitle} testID="members-count">
              {members.length} total · {members.filter((m) => isCurrent(m.status)).length} current
            </Text>
          )}
        </View>
        <Pressable
          onPress={openSettings}
          hitSlop={12}
          testID="members-settings-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="settings-outline" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      {webhook && !loading && !error && (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="members-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, ID or number"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      )}

      {loading ? (
        <View style={styles.center} testID="members-loading">
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.hint}>Loading members…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={28} color={colors.error} />
          <Text style={styles.errorText} testID="members-error-message">{error.message}</Text>
          {error.hint && <Text style={styles.errorHint} testID="members-error-hint">{error.hint}</Text>}
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
            <Pressable onPress={openSettings} style={styles.retryBtnSecondary} testID="members-fix-url-button">
              <Text style={styles.retryTextSecondary}>Update URL</Text>
            </Pressable>
            <Pressable onPress={() => load()} style={styles.retryBtn} testID="members-retry-button">
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      ) : !webhook ? (
        <View style={styles.center}>
          <Ionicons name="link-outline" size={28} color={colors.brand} />
          <Text style={styles.hint}>Connect your Google Sheet in Settings to see the roster.</Text>
          <Pressable onPress={openSettings} style={styles.retryBtn} testID="members-connect-button">
            <Text style={styles.retryText}>Open Settings</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 88 }}>
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.hint}>No members match.</Text>
            </View>
          ) : (
            filtered.map((m, i) => (
              <MemberRow key={`${m.mobile}-${m.first_name}-${m.last_name}-${i}`} member={m} />
            ))
          )}
        </ScrollView>
      )}

      {webhook && !loading && !error && (
        <View style={styles.footer}>
          <Pressable
            onPress={() => router.push("/signup")}
            testID="members-signup-button"
            style={({ pressed }) => [styles.signupBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="person-add" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.signupBtnText}>SIGN UP NEW MEMBER</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function isCurrent(status: string): boolean {
  return status.trim().toLowerCase() === "current";
}
function isPending(status: string): boolean {
  return status.trim().toLowerCase() === "pending approval";
}

function MemberRow({ member }: { member: Member }) {
  const active = isCurrent(member.status);
  const pending = isPending(member.status);
  const testID = `member-${member.member_id || member.last_name}`.toLowerCase().replace(/\s+/g, "-");
  const callable = member.mobile.replace(/[^0-9+]/g, "");
  const chipBg = active ? colors.brandTertiary : pending ? "#FEF3C7" : colors.surfaceSecondary;
  const chipFg = active ? colors.brand : pending ? "#92400E" : colors.onSurfaceSecondary;
  const dotBg = active ? colors.success : pending ? "#F59E0B" : colors.borderStrong;
  const statusLabel = active ? "Current" : pending ? "Pending" : member.status || "Non-Active";
  return (
    <View style={styles.row} testID={testID}>
      <View style={[styles.avatar, !active && { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.avatarText, !active && { color: colors.muted }]}>
          {(member.first_name[0] || "?") + (member.last_name[0] || "")}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {member.first_name} {member.last_name}
          </Text>
          {member.member_id ? (
            <View style={styles.idBadge} testID={`${testID}-id`}>
              <Text style={styles.idBadgeText}>#{member.member_id}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <View style={[styles.statusChip, { backgroundColor: chipBg }]}>
            <View style={[styles.statusDot, { backgroundColor: dotBg }]} />
            <Text style={[styles.statusText, { color: chipFg }]}>{statusLabel}</Text>
          </View>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>
            HCP {member.handicap == null ? "—" : member.handicap}
          </Text>
        </View>
      </View>
      {callable ? (
        <Pressable
          onPress={() => Linking.openURL(`tel:${callable}`).catch(() => {})}
          hitSlop={10}
          testID={`${testID}-call-button`}
          style={({ pressed }) => [styles.callBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="call" size={18} color={colors.brand} />
        </Pressable>
      ) : null}
    </View>
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
    height: 48,
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
    fontSize: 15,
    paddingVertical: 0,
  },
  hint: { color: colors.muted, fontFamily: typography.text, textAlign: "center" },
  errorText: { color: colors.error, fontFamily: typography.textBold, textAlign: "center", fontSize: 14 },
  errorHint: { color: colors.muted, fontFamily: typography.text, textAlign: "center", fontSize: 12, marginTop: 4, lineHeight: 16 },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  retryText: { color: colors.onBrandPrimary, fontFamily: typography.textBold },
  retryBtnSecondary: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  retryTextSecondary: { color: colors.onSurface, fontFamily: typography.textBold },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: typography.textBold,
    fontSize: 14,
    color: colors.brand,
    letterSpacing: 0.5,
  },
  name: { fontFamily: typography.textBold, fontSize: 16, color: colors.onSurface, flexShrink: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 },
  metaDot: { color: colors.borderStrong },
  metaText: { color: colors.muted, fontFamily: typography.text, fontSize: 12 },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: typography.textBold, fontSize: 10, letterSpacing: 0.5 },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.lg,
  },
  signupBtn: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  signupBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 14,
    letterSpacing: 1,
  },
});
