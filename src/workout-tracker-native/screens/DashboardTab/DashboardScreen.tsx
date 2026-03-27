import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DashboardStackParamsList } from '../../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const dailyGreetings = [
    'Ready to workout',
    'Welcome',
    'Ready to Train',
    "Let's Workout",
    'Crush it today',
    'Train hard today',
    'Make today count',
    'Stronger every day',
    'Time to sweat',
    'Bring your best',
];

const getDailyGreeting = () => {
    const todayKey = new Date().toISOString().slice(0, 10);
    let hash = 0;
    for (let i = 0; i < todayKey.length; i++) {
        hash = (hash * 31 + todayKey.charCodeAt(i)) % 1e9;
    }
    return dailyGreetings[Math.abs(hash) % dailyGreetings.length];
};

type User = {
    id: number;
    username: string;
    email: string;
    active_routine_id?: number | null;
};
type Workout = {
    id: number;
    name: string;
    notes: string;
    date: Date;
};
type Exercise = { id: number; name: string; muscle_group: string };
type RoutineDay = {
    id: number;
    day_order: number;
    label: string;
    workout_template: { id: number; name: string; exercises: Exercise[] };
};
type ActiveRoutine = {
    id: number;
    name: string;
    days: RoutineDay[];
};

type Props = NativeStackScreenProps<DashboardStackParamsList, 'DashboardHome'>;

export default function DashboardScreen({ navigation }: Props) {
    const [workouts, setWorkouts] = useState<Workout[]>([]);
    const [user, setUser] = useState<User>();
    const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null);
    const [loading, setLoading] = useState(true);

    useFocusEffect(useCallback(() => {
        setLoading(true);
        Promise.all([fetchUser(), fetchRecentWorkouts()]).finally(() => setLoading(false));
    }, []));

    const fetchUser = async () => {
        try {
            const token = await AsyncStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            setUser(data);
            if (data.active_routine_id) {
                fetchActiveRoutine(data.active_routine_id, token!);
            } else {
                setActiveRoutine(null);
            }
        } catch {
            Alert.alert('Error', 'Failed to load user');
        }
    };

    const fetchActiveRoutine = async (routineId: number, token: string) => {
        try {
            const res = await fetch(`${API_URL}/api/routines/${routineId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setActiveRoutine(await res.json());
        } catch {
            // silently fail
        }
    };

    const fetchRecentWorkouts = async () => {
        try {
            const token = await AsyncStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/workouts/recent`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            setWorkouts(await res.json());
        } catch {
            Alert.alert('Error', 'Failed to load workouts');
        }
    };

    if (loading) return <ActivityIndicator size="large" style={{ flex: 1, marginTop: 50 }} />;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.topbar}>
                <Text style={styles.title}>{getDailyGreeting()}, {user?.username}</Text>
            </View>

            <TouchableOpacity
                style={styles.logButton}
                onPress={() => navigation.navigate('WorkoutLog', { prefill: undefined, editMode: false })}
            >
                <Text style={styles.logButtonText}>+ Log Workout</Text>
            </TouchableOpacity>

            {/* Active Routine Block */}
            <View style={styles.activeBlock}>
                <Text style={styles.sectionLabel}>Active Routine</Text>
                {activeRoutine ? (
                    <>
                        <Text style={styles.activeRoutineName}>{activeRoutine.name}</Text>
                        {activeRoutine.days.map(day => (
                            <View key={day.id} style={styles.dayRow}>
                                <Text style={styles.dayLabel}>{day.label}</Text>
                                <TouchableOpacity
                                    style={styles.logDayBtn}
                                    onPress={() => navigation.navigate('WorkoutLog', {
                                        prefill: {
                                            name: day.label,
                                            notes: '',
                                            exercises: day.workout_template.exercises.map(ex => ({
                                                name: ex.name,
                                                sets: [{ reps: '', weight: '' }],
                                            })),
                                        },
                                        editMode: false,
                                    })}
                                >
                                    <Text style={styles.logDayBtnText}>Log</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </>
                ) : (
                    <Text style={styles.noRoutineText}>No active routine — set one in the Training tab</Text>
                )}
            </View>

            <Text style={styles.sectionLabel}>Recent Workouts</Text>
            {workouts.length === 0 ? (
                <Text style={styles.emptyText}>No recent workouts</Text>
            ) : (
                workouts.map(item => (
                    <TouchableOpacity
                        key={item.id}
                        style={styles.workoutCard}
                        onPress={() => navigation.navigate('WorkoutDetails', { workoutId: item.id })}
                    >
                        <Text style={styles.workoutName}>{item.name}</Text>
                        <Text style={styles.workoutDate}>{new Date(item.date).toLocaleDateString()}</Text>
                        {item.notes ? <Text style={styles.workoutNotes} numberOfLines={1}>{item.notes}</Text> : null}
                    </TouchableOpacity>
                ))
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingTop: spacing.lg + 30 },
    topbar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
    title: { fontSize: typography.fontSize.lg, fontWeight: 'bold', color: colors.textPrimary },
    logButton: {
        backgroundColor: colors.save,
        borderRadius: spacing.sm,
        padding: spacing.md,
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    logButtonText: { color: '#fff', fontSize: typography.fontSize.md, fontWeight: '600' },
    activeBlock: {
        backgroundColor: colors.surface,
        borderRadius: spacing.sm,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    sectionLabel: {
        fontSize: typography.fontSize.sm,
        fontWeight: '700',
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: spacing.sm,
    },
    activeRoutineName: {
        fontSize: typography.fontSize.md,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: spacing.sm,
    },
    dayRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.xs,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    dayLabel: { fontSize: typography.fontSize.md, color: colors.textPrimary },
    logDayBtn: {
        backgroundColor: colors.save,
        borderRadius: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },
    logDayBtnText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.sm },
    noRoutineText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
    workoutCard: {
        backgroundColor: colors.surface,
        borderRadius: spacing.sm,
        padding: spacing.md,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    workoutName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
    workoutDate: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
    workoutNotes: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
    emptyText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
});
