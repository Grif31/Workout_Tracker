---
name: check-env
description: Verify the .env file has required variables and the API URL is correctly set
disable-model-invocation: true
allowed-tools: Read, Bash
---

Check the environment configuration for this Workout Tracker project.

1. Read `src/workout-tracker-native/.env`
2. Verify `EXPO_PUBLIC_API_URL` is present and not empty
3. Parse the URL and check:
   - It uses `http://` (not `https://` or `localhost`)
   - The IP is not `127.0.0.1` or `localhost` (these won't work on a physical device with Expo Go)
   - A port is specified (should be 5000)
4. Ping the URL to check if the Flask server is reachable:
   - Run `curl -s --max-time 3 <API_URL>/api/login -o /dev/null -w "%{http_code}"`
   - Report whether the server responded
5. Summarize: what's correct, what's wrong, and what to fix
