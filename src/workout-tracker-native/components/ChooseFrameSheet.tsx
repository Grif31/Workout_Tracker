import React, { useMemo } from 'react';
import { Image, ImageSourcePropType, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { GREEK_RANKS, rankTextColor } from '../constants/greekRanks';
import { contrastTextColor } from '../utils/contrast';
import ProfileAvatarFrame, { frameOverflow } from './ProfileAvatarFrame';

const FRAME = 64;
const AVATAR = 54;
// Aretē's wreath draws past the frame; every cell leaves the same room so the names line up
const BLEED = frameOverflow('Aretē', FRAME);

type Props = {
  visible: boolean;
  onClose: () => void;
  avatarSource: ImageSourcePropType;
  selectedFrame: string;
  /** Index into GREEK_RANKS of the rank held. Frames unlock by the rank held, never the raw score */
  heldIdx: number;
  onChoose: (rankName: string) => void;
};

export default function ChooseFrameSheet({ visible, onClose, avatarSource, selectedFrame, heldIdx, onChoose }: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} accessibilityLabel="Close">
        <View style={styles.sheet} onStartShouldSetResponder={() => true} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">Choose a frame</Text>
            <Text style={styles.count}>{heldIdx + 1} of {GREEK_RANKS.length} unlocked</Text>
          </View>
          <View style={styles.grid}>
            {GREEK_RANKS.map((rank, i) => {
              const unlocked = i <= heldIdx;
              const inUse = unlocked && rank.name === selectedFrame;
              const sub = inUse ? 'In use' : unlocked ? '' : `At ${rank.low}`;
              return (
                <TouchableOpacity
                  key={rank.name}
                  style={styles.cell}
                  disabled={!unlocked}
                  onPress={() => onChoose(rank.name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: inUse, disabled: !unlocked }}
                  accessibilityLabel={
                    inUse ? `${rank.name} frame, in use`
                      : unlocked ? `${rank.name} frame` : `${rank.name} frame, locked. Unlocks at ${rank.low}`
                  }
                >
                  <View style={styles.frameWrap}>
                    {unlocked ? (
                      <>
                        <Image source={avatarSource} style={styles.avatar} />
                        <ProfileAvatarFrame rankName={rank.name} size={FRAME} avatarSize={AVATAR} />
                      </>
                    ) : (
                      <View style={styles.lockedRing}>
                        <Ionicons name="lock-closed" size={18} color={colors.textSecondary} />
                      </View>
                    )}
                    {inUse && (
                      <View style={[styles.tick, { backgroundColor: rank.color }]}>
                        <Ionicons name="checkmark" size={12} color={contrastTextColor(rank.color)} />
                      </View>
                    )}
                  </View>
                  <Text
                    style={[styles.name, { color: unlocked ? rankTextColor(rank.name, rank.color, mode) : colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {rank.name}
                  </Text>
                  <Text style={styles.sub}>{sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md, backgroundColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.xs, marginBottom: spacing.md },
  title: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  count: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  cell: { width: '25%', alignItems: 'center', gap: 2, minHeight: 44 },
  frameWrap: {
    width: FRAME, height: FRAME, alignItems: 'center', justifyContent: 'center',
    marginVertical: BLEED, marginBottom: BLEED + 2,
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  lockedRing: {
    width: FRAME - 8, height: FRAME - 8, borderRadius: (FRAME - 8) / 2,
    borderWidth: 3, borderStyle: 'dashed', borderColor: colors.inputBorder,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background,
  },
  tick: {
    position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  sub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, minHeight: 14 },
});
