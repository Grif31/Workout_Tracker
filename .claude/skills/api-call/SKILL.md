---
name: api-call
description: Generate a typed fetch call to a Flask API endpoint with auth and error handling
disable-model-invocation: true
argument-hint: [endpoint e.g. GET /api/workouts]
allowed-tools: Read, Glob
---

Generate a typed fetch call for this Workout Tracker project.

Endpoint: $ARGUMENTS

1. Read `src/workout-tracker-native/types/models.tsx` to find the correct response types
2. Read `src/workout-tracker-native/context/AuthContext.tsx` to understand how the token is accessed
3. Read an existing screen (e.g. `src/workout-tracker-native/screens/ProfileTab/ProfileScreen.tsx`) as a reference for fetch patterns
4. Output a ready-to-use TypeScript async function that:
   - Reads `token` from `useAuth()`
   - Uses `process.env.EXPO_PUBLIC_API_URL` as the base URL
   - Sets `Authorization: Bearer <token>` header
   - Handles non-ok responses by throwing an error with the server message
   - Is fully typed with the correct response type from models.tsx
   - Includes a try/catch with an `Alert.alert('Error', ...)` in the catch block

Output just the code block — no extra explanation needed.
