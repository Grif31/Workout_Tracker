import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { GPS_DISTANCE_UNIT_KEY, type DistanceUnit } from '../../utils/units';
import type { NewAchievement } from '../../utils/achievements';
import AchievementUnlockSheet from './AchievementUnlockSheet';

// Long enough for the editor's pop to finish, so the sheet rises over the details
const AFTER_POP_MS = 450;

/**
 * Badges an edit earned, on the workout's details once the editor has closed:
 * an edit has no summary screen to show them. `onTaken` clears the route param
 * so coming back to the screen doesn't show them again.
 */
export default function EditUnlockSheet({ items, onTaken }: { items?: NewAchievement[]; onTaken: () => void }) {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState<NewAchievement[]>([]);
  const [open, setOpen] = useState(false);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('mi');

  useEffect(() => {
    if (user?.id == null) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`)
      .then(v => { if (v === 'km' || v === 'mi') setDistanceUnit(v); })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!items?.length) return;
    setShown(items);
    onTaken();
  }, [items]);

  useEffect(() => {
    if (!shown.length) return;
    const t = setTimeout(() => setOpen(true), AFTER_POP_MS);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown.length || reduceMotion === null) return null;
  return (
    <AchievementUnlockSheet
      items={shown}
      visible={open}
      weightUnit={user?.weight_unit === 'kg' ? 'kg' : 'lbs'}
      distanceUnit={distanceUnit}
      reduceMotion={reduceMotion}
      onClose={() => setOpen(false)}
      onOpenTrophyHall={() => navigation.navigate('ProfileTab', { screen: 'Achievements', initial: false })}
    />
  );
}
