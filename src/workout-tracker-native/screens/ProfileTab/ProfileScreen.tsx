import React, { JSX, useCallback, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { ScrollView } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { typography } from 'theme/typography';
import { colors } from 'theme/colors';
import { spacing } from 'theme/spacing';
import { Image } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ProfileStackParamsList, 'ProfileHome'>;

export default function ProfileScreen({navigation}: Props){
    const { user, token, logout, login, loading } = useAuth();
    const [refreshing, setRefreshing] = useState(false);

    const displayName = user?.name?.trim() || user?.username
    const workouts = user?.workouts || [];
    const workoutCount = workouts.length
    

    const fetchUser = async () => {
        if(!token) return;
        try{
            const res = await fetch(`${API_URL}/api/me`, 
                {headers: {Authorization: `Bearer ${token}`}}
            )
            if (res.ok){
                const data = await res.json();
                await login(data, token)
            }else if(res.status === 401){
                await logout()
            }
        }catch(err){
            console.error('Failed to refresh Profile', err)
        } finally{
            setRefreshing(false)
        }
    };
    useFocusEffect(useCallback(() => {fetchUser();}, [token]));

    const handleLogout = async () => {
        await logout();
    };


    return (

        <ScrollView style={[styles.container]}>
            <View>
                <Text style={[styles.title, typography.title]}>Profile</Text>

                {loading ? ( 
                    <ActivityIndicator size="large" color={colors.textPrimary} />) : (<TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
            
                    <View style={[styles.card,{backgroundColor: colors.surface, padding: spacing.md,},]}>
                        <Image source={user?.profile_pic_url ? {uri: user.profile_pic_url} : require('../../assets/profile-placeholder.png')} style={styles.image}/>
                        <View>
                            <Text style={[styles.value, { color: colors.textPrimary }]}>{displayName || '—'}</Text>
                            <Text>{workoutCount} {workoutCount === 1 ? 'workout' : 'workouts'}</Text>
                        </View>
                    </View></TouchableOpacity>
                )}

            </View>  
        </ScrollView>
        
    )
}
const styles = StyleSheet.create({
    container: {flex: 1,  },
    title: {marginBottom: 20, color: colors.textPrimary , fontWeight: 'bold', padding: 5},
    card: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,},
    label: { fontSize: 14, fontWeight: '500' },
    value: { fontSize: 16, fontWeight: '600' },
    image: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ffffffff'}
});