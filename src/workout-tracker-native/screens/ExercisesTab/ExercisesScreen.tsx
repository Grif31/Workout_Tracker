import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, FlatList, Modal, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Set} from '../../types/models'
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import ExerciseListModal from '../../components/ExerciseList';
import NewExerciseForm from '../../components/NewExerciseForm';
import {ExercisesStackParamsList } from 'navigation/types';

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'ExercisesHome'>;

export default function ExercisesScreen({ navigation }:Props){
    return (
        <View></View>
    );
}