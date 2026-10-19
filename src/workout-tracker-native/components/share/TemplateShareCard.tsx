import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShareCardFrame, ShareCardHeader, ShareCardFooter } from './ShareCardParts';
import {
  ShareExerciseTable,
  tableColumns,
  totalProgrammedSets,
  type ShareTemplateExercise,
} from './ShareExerciseTable';
import { spacing } from '../../theme/spacing';
import { SHARE_TEXT, SHARE_TEXT_MUTED } from '../../constants/shareCardTheme';

type TemplateShareCardProps = {
  templateName: string;
  exercises: ShareTemplateExercise[];
  accentColor: string;
};

const TemplateShareCard = forwardRef<View, TemplateShareCardProps>(
  ({ templateName, exercises, accentColor }, ref) => {
    const totalSets = totalProgrammedSets(exercises);
    const summary = [
      `${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}`,
      totalSets > 0 ? `${totalSets} ${totalSets === 1 ? 'set' : 'sets'}` : null,
    ].filter(Boolean).join('  ·  ');

    return (
      <ShareCardFrame ref={ref} accentColor={accentColor}>
        <ShareCardHeader date="Workout Template" />

        <Text style={styles.templateName} numberOfLines={2}>{templateName}</Text>
        <Text style={styles.summary}>{summary}</Text>

        <View style={styles.table}>
          <ShareExerciseTable
            exercises={exercises}
            columns={tableColumns(exercises)}
            accentColor={accentColor}
            maxRows={10}
          />
        </View>

        <ShareCardFooter />
      </ShareCardFrame>
    );
  }
);

TemplateShareCard.displayName = 'TemplateShareCard';

export default TemplateShareCard;

const styles = StyleSheet.create({
  templateName: {
    fontSize: 24,
    fontWeight: '700',
    color: SHARE_TEXT,
    lineHeight: 30,
  },
  summary: {
    fontSize: 13,
    color: SHARE_TEXT_MUTED,
    marginTop: spacing.xs,
    marginBottom: 14,
  },
  table: {
    marginBottom: 18,
  },
});
