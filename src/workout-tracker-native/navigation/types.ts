import { PrefillWorkoutData } from "components/WorkoutDetails";

export type DashboardStackParamsList = {
    DashboardHome: undefined;
    WorkoutDetails: { workoutId: number };
    WorkoutLog: {prefill?: PrefillWorkoutData, workoutId?:number, editMode?: boolean};
};
export type ExercisesStackParamsList = {
    ExercisesHome: undefined;
    CreateRoutine: undefined;
    RoutineDetail: { routineId: number; routineName: string };
    TemplateDetail: { templateId: number };
    LogRoutine: { prefill?: PrefillWorkoutData; workoutId?: number; editMode?: boolean };
    ExerciseDetail: {
      exerciseId: number;
      exerciseName: string;
      equipment?: string;
      muscleGroup: string;
      secondaryMuscleGroup?: string;
      description?: string;
      imageUrl?: string;
    };
};
export type ProfileStackParamsList = {
    ProfileHome: undefined
    EditProfile: undefined
    Settings: undefined
    ChangePassword: undefined
    WorkoutDetails: { workoutId: number };
    EditWorkout: {prefill?: PrefillWorkoutData, workoutId?:number, editMode?: boolean}
    BodyweightLog: undefined;
};

export type AppStack = {
  DashboardTab: undefined;
  ProfileTab: undefined;
  ExercisesTab: undefined
};
export type AuthStackParamsList = {
    Welcome:        undefined;
    Login:          undefined;
    Signup:         undefined;
    ForgotPassword: undefined;
}
