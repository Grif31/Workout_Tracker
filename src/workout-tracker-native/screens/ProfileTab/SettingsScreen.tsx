import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from 'navigation/types';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'Settings'>;

export default function SettingsScreen({ navigation }:Props){
    return (
        <View></View>
    );
}