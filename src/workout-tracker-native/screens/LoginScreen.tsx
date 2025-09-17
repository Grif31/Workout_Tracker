import React, { JSX } from 'react';
import { View, Text, Button, Alert, StyleSheet, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
const API_URL = process.env.EXPO_PUBLIC_API_URL;
import { AuthStackParamsList } from '../navigation/types';
import { useAuth } from 'context/AuthContext';

type Props = NativeStackScreenProps<AuthStackParamsList, 'Login'>;

export default function LoginScreen({navigation}: Props){
    const {login} = useAuth()
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');

    const handleLogin = async () => {
        try {
            const res = await fetch(`${API_URL}/api/login`, {
              method: 'POST', 
              headers: {'Content-Type': 'application/json'}, 
              body: JSON.stringify({email, password})
            });
            const data = await res.json();
            if(res.ok){
                await login(data, data.access_token);

            }else {
                Alert.alert('Login Failed', data.message || 'Invalid Credentials');
            }
        } catch(error){
            Alert.alert('Error', 'Something went wrong, please try again');

        }
    }
    return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title="Login" onPress={handleLogin} />
      <Button title="Create Account " onPress={() => navigation.navigate('Signup')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 15, borderRadius: 5 },
});

