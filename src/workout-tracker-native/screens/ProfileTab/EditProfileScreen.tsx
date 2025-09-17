import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { AppStack, ProfileStackParamsList } from 'navigation/types';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'EditProfile'>;

export default function EditProfileScreen({ navigation }:Props){
    return (
        <View></View>
    );
}