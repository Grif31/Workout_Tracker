import  { StatusBar }  from 'expo-status-bar';
import React, { JSX } from 'react';
import AppNavigator from './navigation/AppNavigator';
import  { StyleSheet, Text, View } from 'react-native';

export default function App(): JSX.Element {
  return (
    
      <AppNavigator />
    
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
