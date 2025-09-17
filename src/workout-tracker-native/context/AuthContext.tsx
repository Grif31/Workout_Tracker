import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const  API_URL = process.env.EXPO_PUBLIC_API_URL;

type AuthContextType = {
    user: any;
    token: string | null;
    login: (userData: any , token: string) => Promise<void>;
    logout: () => Promise<void>;
    loading: boolean;
};

const AuthContext = createContext<AuthContextType>(null!);

export const AuthProvider = ({children} : {children: React.ReactNode}) => {
    const [user, setUser] = useState<any>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const savedToken = await AsyncStorage.getItem('token');
            if(savedToken){
                try{
                    const res = await fetch(`${API_URL}/api/me`, {
                        headers: {'Authorization': `Bearer ${savedToken}`}, 
                    });
                    if(res.ok){
                        const data = await res.json();
                        setUser(data)
                        setToken(savedToken)
                    }else{
                        await AsyncStorage.removeItem('token');
                        await AsyncStorage.removeItem('user');
                    }
                }catch(err){
                    console.error('Token verification failed', err);
                    await AsyncStorage.removeItem('token');
                    await AsyncStorage.removeItem('user');
                }
            }
            setLoading(false);
        })();
    }, []);

    const login = async (userData: any, token: string) => {
        setUser(userData);
        setToken(token);
        await AsyncStorage.setItem('token', token);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
    };

    const logout = async () => {
        setUser(null);
        setToken(null);
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('user');

    }
    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );

}

export const useAuth = () => useContext(AuthContext)