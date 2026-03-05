---
name: new-screen
description: Create a new React Native screen and register it in the correct stack navigator
disable-model-invocation: true
argument-hint: [ScreenName] [tab: Dashboard|Exercises|Profile]
allowed-tools: Read, Write, Edit, Glob
---

Create a new React Native screen for this Workout Tracker project.

Screen name: $0
Tab: $1

1. Read the relevant stack navigator in `src/workout-tracker-native/navigation/` for the $1 tab
2. Read `src/workout-tracker-native/navigation/types.ts` to understand the param list patterns
3. Read an existing screen in the same tab folder as a reference for structure and style
4. Create the new screen at `src/workout-tracker-native/screens/$1Tab/$0Screen.tsx`:
   - Use TypeScript with proper NativeStackScreenProps typing
   - Include navigation and route props
   - Use `useAuth` from `context/AuthContext` if the screen needs the current user
   - Follow the same StyleSheet patterns as existing screens
   - Include a basic loading state if data is fetched
5. Add the screen to the param list in `src/workout-tracker-native/navigation/types.ts`
6. Register the screen in the correct stack navigator file

Follow the exact same patterns as the existing screens in that tab.
