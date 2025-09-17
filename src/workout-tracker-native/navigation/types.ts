export type DashboardStackParamsList = {
    DashboardHome: undefined;
    WorkoutDetails: { workoutId: number };
    WorkoutLog: undefined;
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
