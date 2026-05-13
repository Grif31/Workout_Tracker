import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setTokens, clearTokens, registerUnauthCallback, apiFetch } from '../utils/api';
import { registerPushToken, deregisterPushToken } from '../utils/notifications';

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

    const logout = async () => {
        await deregisterPushToken();
        setUser(null);
        setToken(null);
        clearTokens();
        await AsyncStorage.multiRemove(['token', 'refresh_token', 'user']);
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
                try {
                    // apiFetch will silently refresh the access token if it has expired
                    const res = await apiFetch('/api/me');
                    if (res.ok) {
                        const data = await res.json();
                        setUser(data);
                        // Read whatever token is current (may have been refreshed)
                        const currentAccess = await AsyncStorage.getItem('token');
                        setToken(currentAccess);
                    } else {
                        await logout();
                    }
                } catch {
                    await logout();
                }
            }
            setLoading(false);
        })();
    }, []);

    const login = async (userData: any, accessToken: string, refreshToken: string) => {
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
