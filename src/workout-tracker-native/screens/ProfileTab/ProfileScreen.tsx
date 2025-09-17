import React, { JSX, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { ScrollView } from 'react-native-gesture-handler';
const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ProfileStackParamsList, 'ProfileHome'>;

export default function ProfileScreen({navigation}: Props){
    const { user, token, logout, login, loading } = useAuth();
    const [refreshing, setRefreshing] = useState(false);

    const fetchUser = async () => {
        if(!token) return;
        const res = await fetch(`${API_URL}/api/me`)

    }

    return (

        <ScrollView>
            <View>
                <Text>Profile</Text>
            </View>  
        </ScrollView>
        
    )
}