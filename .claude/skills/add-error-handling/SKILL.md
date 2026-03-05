---
name: add-error-handling
description: Review a React Native screen and add missing error and loading states
disable-model-invocation: true
argument-hint: [relative path to screen file]
allowed-tools: Read, Edit
---

Add error and loading handling to a screen in this Workout Tracker project.

File: $ARGUMENTS

1. Read the file at $ARGUMENTS
2. Identify all `fetch` / API calls that are missing any of:
   - A `loading` state shown to the user (e.g. `ActivityIndicator`)
   - An `error` state shown to the user (e.g. `Alert.alert` or error text)
   - A check for `!res.ok` before using the response data
3. Add the missing states following the patterns already in the file:
   - Use `useState` for `loading` and `error` where needed
   - Show an `ActivityIndicator` while loading
   - Use `Alert.alert('Error', message)` in catch blocks
   - Check `!res.ok` and surface the server's error message
4. Do not refactor, rename, or restructure anything beyond what is needed for error/loading handling
