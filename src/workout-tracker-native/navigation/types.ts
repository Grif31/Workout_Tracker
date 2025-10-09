import { PrefillWorkoutData } from "components/WorkoutDetails";

export type DashboardStackParamsList = {
    DashboardHome: undefined;
    WorkoutDetails: { workoutId: number };
    WorkoutLog: {prefill?: PrefillWorkoutData, workoutId?:number, editMode?: boolean};
};
export type ExercisesStackParamsList = {
    ExercisesHome: undefined
    CreateRoutine: undefined
};
export type ProfileStackParamsList = {
    ProfileHome: undefined
    EditProfile: undefined
    Settings: undefined
    ChangePassword: undefined
    WorkoutDetails: { workoutId: number };
    EditWorkout: {prefill?: PrefillWorkoutData, workoutId?:number, editMode?: boolean}

};

export type AppStack = {
  DashboardTab: undefined;
  ProfileTab: undefined;
  ExercisesTab: undefined
};
export type AuthStackParamsList = {
    Login: undefined;
    Signup: undefined;
}
