import { PrefillWorkoutData } from "components/WorkoutDetails";

export type ExerciseDetailParams = {
  exerciseId: number;
  exerciseName: string;
  equipment?: string;
  muscleGroup?: string;
  secondaryMuscleGroup?: string;
  description?: string;
  imageUrl?: string;
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
export type DashboardStackParamsList = {
    DashboardHome: undefined;
    WorkoutDetails: { workoutId: number };
    CardioDetails: { workoutId: number };
    WorkoutSummary: WorkoutSummaryParams;
    WorkoutLog: {prefill?: PrefillWorkoutData, workoutId?:number, editMode?: boolean};
    GPSCardio: undefined;
    ExerciseDetail: ExerciseDetailParams;
    GreekRankIntro: undefined;
};
export type ExercisesStackParamsList = {
    ExercisesHome: undefined;
    ExerciseDetail: ExerciseDetailParams;
};
export type PreviewExercise = { id: number; name: string; muscle_group: string };
export type PreviewDay = { label: string; exercises: PreviewExercise[] };

export type TrainingStackParamsList = {
    TrainingHome: undefined;
    CreateRoutine: undefined;
    RoutineDetail: { routineId: number; routineName: string };
    TemplateDetail: { templateId: number; muscleGroups?: string[] };
    LogRoutine: { prefill?: PrefillWorkoutData; workoutId?: number; editMode?: boolean };
    WorkoutDetails: { workoutId: number };
    WorkoutSummary: WorkoutSummaryParams;
    ExerciseDetail: ExerciseDetailParams;
    StrengthScore: undefined;
    AIWorkoutPreview: {
        generateType: 'routine' | 'template';
        name: string;
        description?: string;
        exercises?: PreviewExercise[];
        days?: PreviewDay[];
        coachDays: number;
        coachGoal: string;
        coachExp: string;
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
    Onboarding:         undefined;
    OnboardingTutorial: undefined;
}

export type RootStackParamsList = {
    AppTabs: undefined;
    Paywall: { source?: string };
}
