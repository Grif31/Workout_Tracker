import React, { JSX, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamsList } from '../navigation/types';
import { useAuth } from 'context/AuthContext';
const  API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<AuthStackParamsList, 'Signup'>;

export default function SignupScreen({navigation}: Props): JSX.Element{
    const {login} = useAuth();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleSignup = async () => {
        if(password !== confirmPassword){
            Alert.alert('Error', 'Passwords do not match');
            return; 
        }
        try {
            const res = await fetch(`${API_URL}/api/signup`,{
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username, email, password})
            });

            const data = await res.json();
            
            if(res.ok){
                Alert.alert('Success', 'Account Successfully Created!');
                await login(data, data.access_token);
            }else{
                Alert.alert('Error', data.message || 'Please try again');
            }
        }catch(error){
            Alert.alert('Error', 'Something went wrong');
        }

    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Create Account</Text>
            <TextInput
                style={styles.input}
                placeholder='Username'
                value={username}
                onChangeText={setUsername}
            />
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
                value={password}
                secureTextEntry
                onChangeText={setPassword}
            />
            <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                value={confirmPassword}
                secureTextEntry
                onChangeText={setConfirmPassword}
            />
            <Button title='Sign Up' onPress={handleSignup}/>
        </View>
    );


}
        
const styles = StyleSheet.create({
          container: { flex: 1, justifyContent: 'center', padding: 20 },
          title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
          input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 15, borderRadius: 5 },
});
