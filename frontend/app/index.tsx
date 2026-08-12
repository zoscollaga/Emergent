import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import {
  IdentifiedMember,
  StoredCourse,
  getIdentifiedMember,
  getSelectedCourse,
  setSelectedCourse,
} from "@/src/lib/storage";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1742498626081-a64f9677f468?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzl8MHwxfHNlYXJjaHwxfHwlMjJnb2xmJTIwY291cnNlJTIwbGFuZHNjYXBlJTIyfGVufDB8fHx8MTc4NTgxMzk5MXww&ixlib=rb-4.1.0&q=85";

const KEILOR: StoredCourse = {
  id: "keilor",
  name: "Keilor Golf Course",
  latitude: -37.7301,
  longitude: 144.83,
  holes: [
    { number: 1,  par: 4, distance: 317, index: 11 },
    { number: 2,  par: 3, distance: 136, index: 18 },
    { number: 3,  par: 5, distance: 475, index: 9 },
    { number: 4,  par: 4, distance: 357, index: 5 },
    { number: 5,  par: 4, distance: 324, index: 13 },
    { number: 6,  par: 3, distance: 135, index: 15 },
    { number: 7,  par: 4, distance: 400, index: 1 },
    { number: 8,  par: 4, distance: 391, index: 3 },
    { number: 9,  par: 4, distance: 376, index: 7 },
    { number: 10, par: 4, distance: 423, index: 2 },
    { number: 11, par: 3, distance: 179, index: 8 },
    { number: 12, par: 4, distance: 368, index: 4 },
    { number: 13, par: 3, distance: 177, index: 10 },
    { number: 14, par: 3, distance: 164, index: 12 },
    { number: 15, par: 5, distance: 453, index: 14 },
    { number: 16, par: 4, distance: 329, index: 16 },
    { number: 17, par: 4, distance: 325, index: 17 },
    { number: 18, par: 4, distance: 351, index: 6 },
  ],
};

export default function HomeScreen() {
  const router = useRouter();
  const [identity, setIdentity] = useState<IdentifiedMember | null>(null);

  const refresh = useCallback(async () => {
    // Persist Keilor as the selected course. If a stale different course was saved,
    // overwrite it — Keilor is the only course for now.
    const cached = await getSelectedCourse();
    if (!cached || cached.id !== KEILOR.id) {
      await setSelectedCourse(KEILOR);
    }
    setIdentity(await getIdentifiedMember());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <View style={styles.root} testID="home-screen">
      <View style={styles.hero}>
        <Image
          source={{ uri: HERO_IMAGE }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={300}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={styles.heroContent} edges={["top"]}>
          <View style={styles.brandRow}>
            <Text style={styles.brandLabel} testID="brand-label">GOLF SCORECARD</Text>
            <View style={styles.brandActions}>
              <Pressable
                onPress={() => router.push("/identify")}
                hitSlop={12}
                testID="identity-chip"
                style={({ pressed }) => [styles.memberChip, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="person-circle" size={14} color="#D1FAE5" />
                <Text style={styles.memberChipText} numberOfLines={1}>
                  {identity
                    ? `${identity.first_name} ${identity.last_name}${identity.member_id ? " · #" + identity.member_id : ""}`
                    : "Choose your name"}
                </Text>
                <Ionicons name="chevron-forward" size={12} color="#D1FAE5" />
              </Pressable>
              <Pressable
                onPress={() => router.push("/settings")}
                hitSlop={12}
                testID="settings-button"
                style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="settings-outline" size={16} color="#D1FAE5" />
              </Pressable>
            </View>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={styles.eyebrow}>Today{"\u2019"}s course</Text>
          <Text style={styles.courseName} numberOfLines={2} testID="current-course-name">
            {KEILOR.name}
          </Text>
          <Text style={styles.courseMeta}>18 holes · Par {KEILOR.holes.reduce((s, h) => s + h.par, 0)}</Text>
        </SafeAreaView>
      </View>

      <SafeAreaView style={styles.actions} edges={["bottom"]}>
        <Pressable
          testID="start-round-solo-button"
          onPress={() => router.push("/round")}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="golf" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.primaryBtnText}>START ROUND · SOLO</Text>
        </Pressable>
        <Pressable
          testID="start-round-pair-button"
          onPress={() => router.push("/pair")}
          style={({ pressed }) => [styles.secondaryBigBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="people" size={20} color={colors.brand} />
          <Text style={styles.secondaryBigBtnText}>PLAY WITH A MARKER</Text>
        </Pressable>
        <Pressable
          testID="members-button"
          onPress={() => router.push("/members")}
          style={({ pressed }) => [styles.tertiaryBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="list" size={18} color={colors.onSurfaceSecondary} />
          <Text style={styles.tertiaryBtnText}>MEMBERS</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { flex: 1, backgroundColor: "#0b1a12" },
  heroContent: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  settingsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandLabel: {
    color: colors.onBrandSecondary,
    letterSpacing: 3,
    fontFamily: typography.textBold,
    fontSize: 12,
    opacity: 0.9,
  },
  memberChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    maxWidth: 240,
  },
  memberChipText: {
    color: "#D1FAE5",
    fontFamily: typography.textBold,
    fontSize: 12,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  eyebrow: {
    color: "#D1FAE5",
    fontFamily: typography.text,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  courseName: {
    color: colors.onBrandSecondary,
    fontFamily: typography.display,
    fontSize: 40,
    lineHeight: 44,
  },
  courseMeta: {
    color: "#D1FAE5",
    fontFamily: typography.text,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  actions: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    backgroundColor: colors.brandPrimary,
    height: 66,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 16,
    letterSpacing: 1.2,
  },
  secondaryBigBtn: {
    marginTop: spacing.md,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  secondaryBigBtnText: {
    color: colors.brand,
    fontFamily: typography.textBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  tertiaryBtn: {
    marginTop: spacing.sm,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  tertiaryBtnText: {
    color: colors.onSurfaceSecondary,
    fontFamily: typography.textBold,
    fontSize: 13,
    letterSpacing: 1.5,
  },
});
