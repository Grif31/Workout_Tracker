import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { ProgressStackParamsList } from '../../navigation/types';
import TopTabBar from '../../components/TopTabBar';
import ProgressOverview from './ProgressOverview';
import ExercisesScreen from './ExercisesScreen';

type Props = NativeStackScreenProps<ProgressStackParamsList, 'ProgressHome'>;

type Section = 'overview' | 'exercises';
const TABS: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'exercises', label: 'Exercises' },
];

export default function ProgressScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [section, setSection] = useState<Section>('overview');
  // Exercises mounts on its first visit and then stays, so switching back
  // keeps its search, filters and scroll position
  const [exercisesMounted, setExercisesMounted] = useState(false);

  const pick = (next: Section) => {
    if (next === 'exercises') setExercisesMounted(true);
    setSection(next);
  };

  return (
    <View style={styles.container}>
      <TopTabBar tabs={TABS} active={section} onChange={pick} />
      <View style={[styles.section, section !== 'overview' && styles.hidden]}>
        <ProgressOverview navigation={navigation} />
      </View>
      {exercisesMounted && (
        <View style={[styles.section, section !== 'exercises' && styles.hidden]}>
          <ExercisesScreen navigation={navigation} />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  section: { flex: 1 },
  hidden: { display: 'none' },
});
