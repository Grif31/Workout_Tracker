import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setTokens, clearTokens, registerUnauthCallback, apiFetch } from '../utils/api';
import { appCache } from '../utils/appCache';
import { registerPushToken, deregisterPushToken } from '../utils/notifications';
import { useTheme } from './ThemeContext';

type AuthContextType = {
    user: any;
    token: string | null;
    login: (userData: any, accessToken: string, refreshToken: string) => Promise<void>;
    logout: () => Promise<void>;
    updateUser: (userData: any) => Promise<void>;
    loading: boolean;
};

const AuthContext = createContext<AuthContextType>(null!);

export const AuthProvider = ({children} : {children: React.ReactNode}) => {
    const [user, setUser] = useState<any>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const themeCtx = useTheme();

    const logout = async () => {
        // Save this user's accent preference before resetting
        if (user?.id) {
            await AsyncStorage.setItem(`@theme_accent_${user.id}`, themeCtx.accentPreset.name);
        }
        themeCtx.resetAccent();
        await deregisterPushToken();
        setUser(null);
        setToken(null);
        clearTokens();
        appCache.clear();
        await AsyncStorage.multiRemove([
            'token', 'refresh_token', 'user',
            'greek_rank_cached', '@theme_accent',
            'coach_insights_cache', 'minimized_workout_session',
        ]);
    };

    useEffect(() => {
        // When the refresh token expires mid-session, clear React state
        registerUnauthCallback(() => {
            setUser(null);
            setToken(null);
        });

        (async () => {
            const [[, savedAccess], [, savedRefresh]] = await AsyncStorage.multiGet(['token', 'refresh_token']);
            if (savedAccess) {
                setTokens(savedAccess, savedRefresh ?? '');
                // Offline or server-error launch: keep the session and show the
                // cached profile instead of logging the user out.
                const restoreFromCache = async () => {
                    const cached = await AsyncStorage.getItem('user');
                    if (cached) {
                        try {
                            setUser(JSON.parse(cached));
                            setToken(savedAccess);
                        } catch {}
                    }
                };
                try {
                    // apiFetch will silently refresh the access token if it has expired
                    const res = await apiFetch('/api/me');
                    if (res.ok) {
                        const data = await res.json();
                        setUser(data);
                        await AsyncStorage.setItem('user', JSON.stringify(data));
                        // Read whatever token is current (may have been refreshed)
                        const currentAccess = await AsyncStorage.getItem('token');
                        setToken(currentAccess);
                    } else if (res.status === 401) {
                        // Refresh already failed inside apiFetch — session is dead
                        await logout();
                    } else {
                        await restoreFromCache();
                    }
                } catch {
                    // Network unreachable — not an auth failure
                    await restoreFromCache();
                }
            }
            setLoading(false);
        })();
    }, []);

    const login = async (userData: any, accessToken: string, refreshToken: string) => {
        // Clear any previous user's cached data before setting up the new session
        appCache.clear();
        await AsyncStorage.multiRemove([
            'greek_rank_cached', '@theme_accent',
            'coach_insights_cache', 'minimized_workout_session',
        ]);
        // Restore this user's saved accent (or default if they've never set one)
        await themeCtx.loadAccentForUser(userData.id);
        setUser(userData);
        setToken(accessToken);
        setTokens(accessToken, refreshToken);
        await AsyncStorage.setItem('token', accessToken);
        await AsyncStorage.setItem('refresh_token', refreshToken);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        registerPushToken();
    };

    const updateUser = async (userData: any) => {
        setUser((prev: any) => ({ ...prev, ...userData }));
        await AsyncStorage.setItem('user', JSON.stringify({ ...user, ...userData }));
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
