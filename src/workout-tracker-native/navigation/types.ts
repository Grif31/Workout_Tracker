import { PrefillWorkoutData } from "components/WorkoutDetails";

export type ExerciseDetailParams = {
  exerciseId: number;
  exerciseName: string;
  equipment?: string;
  muscleGroup?: string;
  secondaryMuscleGroup?: string;
  description?: string;
  imageUrl?: string;
  isCustom?: boolean;
  initialTab?: 'overview' | 'charts' | 'history';
};

export type WorkoutSummaryParams = {
  workoutId: number;
  workoutName: string;
  prs: Array<{ exercise_name: string; pr_type: string; value: number; label?: string; weight_context?: number }>;
  totalVolume: number;
  totalReps: number;
  totalSets: number;
  muscles: string[];
  isFirstWorkout: boolean;
};

export type WeeklySummaryData = {
  week_start: string;
  week_end: string;
  workouts: number;
  training_days: string[];
  total_duration_min: number;
  total_volume: number;
  total_reps: number;
  prev_week_workouts: number;
  prev_week_volume: number;
  rolling_avg_workouts: number;
  rolling_avg_volume: number;
  most_improved_lift?: { exercise_name: string; prev_best: number; this_best: number; gain: number };
  most_improved_cardio?: {
    exercise_name: string; pr_type: 'best_time' | 'best_distance'; milestone_label: string;
    prev_best: number; this_best: number; gain: number;
  };
  avg_rpe?: number;
  calories_burned?: number;
  distance_km?: number;
  prs: Array<{
    exercise_template_id: number; exercise_name: string; equipment?: string;
    muscle_group?: string; image_url?: string; is_custom?: boolean;
    pr_type: string; value: number; weight_context?: number;
  }>;
  bodyweight_change?: { start: number; end: number };
  muscle_sets: Record<string, number>;
  weight_unit: 'lbs' | 'kg';
};
// Optional prefetched payload — the auto-popup passes data it already fetched
// so the screen doesn't re-request it; the manual entry point navigates with
// no params and lets the screen fetch the default (most recent completed) week.
export type WeeklySummaryParams = { data?: WeeklySummaryData } | undefined;
export type DashboardStackParamsList = {
    DashboardHome: undefined;
    WorkoutDetails: { workoutId: number };
    CardioDetails: { workoutId: number };
    WorkoutSummary: WorkoutSummaryParams;
    WorkoutLog: {prefill?: PrefillWorkoutData, workoutId?:number, editMode?: boolean};
    GPSCardio: undefined;
    ExerciseDetail: ExerciseDetailParams;
    GreekRankIntro: undefined;
    WeeklySummary: WeeklySummaryParams;
};
export type ExercisesStackParamsList = {
    ExercisesHome: undefined;
    ExerciseDetail: ExerciseDetailParams;
};
export type PreviewExercise = {
  id: number;
  name: string;
  muscle_group: string;
  exercise_type?: string;
  prescribed_sets?: number;
  prescribed_reps?: string;
  prescribed_rpe?: number;
};
export type PreviewDay = { label: string; exercises: PreviewExercise[] };

export type TrainingStackParamsList = {
    TrainingHome: undefined;
    CreateRoutine: { routineId?: number; routineName?: string } | undefined;
    RoutineDetail: { routineId: number; routineName: string };
    TemplateDetail: { templateId: number; muscleGroups?: string[] };
    LogRoutine: { prefill?: PrefillWorkoutData; workoutId?: number; editMode?: boolean };
    WorkoutDetails: { workoutId: number };
    WorkoutSummary: WorkoutSummaryParams;
    ExerciseDetail: ExerciseDetailParams;
    StrengthScore: undefined;
    WeeklySummary: WeeklySummaryParams;
    AIWorkoutPreview: {
        generateType: 'routine' | 'template';
        name: string;
        description?: string;
        exercises?: PreviewExercise[];
        days?: PreviewDay[];
        coachDays: number;
        coachGoal: string;
        coachExp: string;
        coachEquipment: string;
        coachSessionLength: string;
        coachAvoid: string;
        coachNotes: string;
    };
};
export type ProfileStackParamsList = {
    ProfileHome: undefined
    EditProfile: undefined
    Settings: undefined
    AccountSettings: undefined
    ChangePassword: undefined
    WorkoutDetails: { workoutId: number };
    CardioDetails: { workoutId: number };
    EditWorkout: {prefill?: PrefillWorkoutData, workoutId?:number, editMode?: boolean}
    Measurements: undefined;
    PersonalRecords: undefined;
    PRDashboard: undefined;
    PRProgression: {
        exerciseTemplateId: number;
        exerciseName: string;
        // Pre-selects the metric/context that was actually tapped (a feed card,
        // a table row, a pin) instead of always defaulting to the top-priority
        // metric. Omitted when the caller can't know a specific one (e.g. the
        // stalled section's "All" view spans every type).
        prType?: 'max_weight' | 'max_reps' | 'estimated_1rm' | 'best_time' | 'best_distance' | 'max_duration';
        weightContext?: number | null;
    };
    GreekRank: undefined;
};

export type AppStack = {
  DashboardTab: undefined;
  ExercisesTab: undefined;
  TrainingTab: undefined;
  ProfileTab: undefined;
};
export type AuthStackParamsList = {
    Welcome:        undefined;
    Login:          undefined;
    Signup:         undefined;
    ForgotPassword: undefined;
    ResetPassword:  { email: string };
}

export type OnboardingStackParamsList = {
    Onboarding:             undefined;
    OnboardingTutorial:     undefined;
    OnboardingUnits:        undefined;
    OnboardingPersonalInfo: undefined;
}

export type RootStackParamsList = {
    AppTabs: undefined;
    Paywall: { source?: string };
}
