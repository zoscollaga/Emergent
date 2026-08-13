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
  clearActiveRound,
  getActiveRound,
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
  const [course, setCourse] = useState<StoredCourse>(KEILOR);
  const [roundActive, setRoundActive] = useState(false);

  const refresh = useCallback(async () => {
    const cached = await getSelectedCourse();
    if (!cached) {
      // First launch: seed Keilor so scoring works before the user opens the picker
      await setSelectedCourse(KEILOR);
      setCourse(KEILOR);
    } else {
      setCourse(cached);
    }
    setIdentity(await getIdentifiedMember());
    // Only treat a round as "in progress" once the player has actually scored a
    // hole. Merely opening the round screen (which auto-creates an ActiveRound
    // shell) shouldn't lock the course picker.
    const active = await getActiveRound();
    const hasScoredHole = active?.entries.some((e) => e.score != null || e.putts != null) ?? false;
    setRoundActive(hasScoredHole);
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
            <View style={{ flex: 1 }} />
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
          <Pressable
            onPress={() => !roundActive && router.push("/courses")}
            disabled={roundActive}
            testID="course-picker-chip"
            style={({ pressed }) => [
              styles.courseChip,
              pressed && !roundActive && { opacity: 0.85 },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.courseName} numberOfLines={2} testID="current-course-name">
                {course.name}
              </Text>
              <Text style={styles.courseMeta}>
                18 holes · Par {course.holes.reduce((s, h) => s + h.par, 0)}
                {roundActive ? " · locked while a round is in progress" : "  ·  Tap to change"}
              </Text>
            </View>
            {!roundActive && (
              <Ionicons name="chevron-forward" size={20} color="#D1FAE5" />
            )}
            {roundActive && (
              <Ionicons name="lock-closed" size={16} color="rgba(255,255,255,0.7)" />
            )}
          </Pressable>
          {roundActive && (
            <Pressable
              onPress={async () => {
                await clearActiveRound();
                refresh();
              }}
              testID="cancel-active-round-button"
              style={({ pressed }) => [styles.cancelChip, pressed && { opacity: 0.75 }]}
            >
              <Ionicons name="trash-outline" size={12} color="#FCA5A5" />
              <Text style={styles.cancelChipText}>Cancel round</Text>
            </Pressable>
          )}
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
          testID="leaderboard-button"
          onPress={() => router.push("/leaderboard")}
          style={({ pressed }) => [styles.leaderboardBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="trophy" size={20} color={colors.onSurface} />
          <Text style={styles.leaderboardBtnText}>LIVE LEADERBOARD</Text>
        </Pressable>
        <Pressable
          testID="player-profile-button"
          onPress={() => router.push("/profile")}
          style={({ pressed }) => [styles.profileBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="person-circle" size={20} color={colors.brand} />
          <Text style={styles.profileBtnText} numberOfLines={1}>
            {identity
              ? `${identity.first_name} ${identity.last_name}`.trim().toUpperCase() || `#${identity.member_id}`
              : "SIGN IN AS A PLAYER"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.brand} />
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
  courseChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingRight: 4,
  },
  cancelChip: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(220,38,38,0.15)",
  },
  cancelChipText: {
    color: "#FCA5A5",
    fontFamily: typography.textBold,
    fontSize: 11,
    letterSpacing: 0.5,
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
  leaderboardBtn: {
    marginTop: spacing.md,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  leaderboardBtnText: {
    color: colors.onSurface,
    fontFamily: typography.textBold,
    fontSize: 14,
    letterSpacing: 1.2,
  },
  profileBtn: {
    marginTop: spacing.sm,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.xl,
  },
  profileBtnText: {
    flex: 1,
    textAlign: "center",
    color: colors.brand,
    fontFamily: typography.textBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
