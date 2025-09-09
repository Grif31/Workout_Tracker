import React, { JSX } from 'react';
import { View, Text, Button, Alert, StyleSheet, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';


type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) : JSX.Element {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');

    const handleLogin = async () => {
        try {
            const res = await fetch('http://192.168.68.55:5000/api/login', {
              method: 'POST', 
              headers: {'Content-Type': 'application/json'}, 
              body: JSON.stringify({email, password})
            });

            const data = await res.json();
            if(res.ok){
                await AsyncStorage.setItem('token', data.access_token);
                navigation.navigate('Dashboard');
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

