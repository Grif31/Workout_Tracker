import React, { JSX, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>; 


export default function SignupScreen({navigation}: Props): JSX.Element{
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
            const res = await fetch('http://192.168.1.24:5000/api/signup',{
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username, email, password})
            });

            const data = await res.json();
            
            if(res.ok){
                Alert.alert('Success', 'Account Successfully Created!');
                navigation.navigate('Login');
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
