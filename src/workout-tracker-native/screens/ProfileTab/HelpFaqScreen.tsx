import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Collapsible, { useCollapseAnim } from '../../components/Collapsible';
import SettingsHeader from '../../components/settings/SettingsHeader';
import { createSettingsStyles } from '../../components/settings/settingsStyles';
import { FAQ, type FaqItem } from '../../constants/faq';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { SUPPORT_EMAIL, openSupportEmail, supportEmailUrl } from '../../utils/support';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'HelpFaq'>;

function FaqRow({ item, colors, styles }: { item: FaqItem; colors: Colors; styles: ReturnType<typeof createStyles> }) {
  const [open, setOpen] = useState(false);
  const progress = useCollapseAnim(open);
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <View>
      <TouchableOpacity
        style={styles.question}
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        activeOpacity={0.7}
      >
        <Text style={styles.questionText}>{item.question}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
        </Animated.View>
      </TouchableOpacity>
      <Collapsible progress={progress} expanded={open}>
        <Text style={styles.answer}>{item.answer}</Text>
      </Collapsible>
    </View>
  );
}

export default function HelpFaqScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const base = useMemo(() => createSettingsStyles(colors), [colors]);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={base.container} contentContainerStyle={base.content}>
      <SettingsHeader title="FAQ" onBack={() => navigation.goBack()} />

      <View style={[base.group, styles.firstGroup]}>
        {FAQ.map((item, i) => (
          <React.Fragment key={item.question}>
            {i > 0 && <View style={base.divider} />}
            <FaqRow item={item} colors={colors} styles={styles} />
          </React.Fragment>
        ))}
      </View>

      <Text style={styles.footer}>
        Still stuck? Email us at{' '}
        <Text style={styles.footerLink} onPress={() => openSupportEmail(supportEmailUrl())} accessibilityRole="link">
          {SUPPORT_EMAIL}
        </Text>
      </Text>
    </ScrollView>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    firstGroup: { marginTop: spacing.lg },
    question: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      minHeight: 52,
    },
    questionText: {
      flex: 1,
      fontSize: typography.fontSize.md,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    answer: {
      fontSize: typography.fontSize.sm,
      lineHeight: 21,
      color: colors.textSecondary,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    footer: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
    footerLink: { color: colors.accent, fontWeight: '600' },
  });
