import React, { useState } from 'react';
import { 
    View, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    Alert, 
    SafeAreaView, 
    KeyboardAvoidingView, 
    Platform, 
    StatusBar, 
    StyleSheet, 
    ScrollView, 
    ActivityIndicator,
    LogBox
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from "@react-navigation/native";
import Icon from 'react-native-vector-icons/Feather';

// Permanently disable all visible on-screen warning boxes
LogBox.ignoreAllLogs();

const SignUp = () => {
    const navigation = useNavigation();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    
    const [showPassword, setShowPassword] = useState(false);
    const [focusedInput, setFocusedInput] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSignUp = async () => {
        if (!username.trim() || !email.trim() || !password) {
            Alert.alert("Required", "Please fill in all fields.");
            return;
        }

        const email_pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        // Password must contain at least 1 lowercase, 1 uppercase, 1 digit, 1 special character, and be at least 8 chars long
        const password_pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

        if (!email_pattern.test(email)) {
            Alert.alert("Invalid Email", "Please enter a valid email address.");
            return;
        }

        if (!password_pattern.test(password)) {
            Alert.alert(
                "Weak Password", 
                "Password must be at least 8 characters long, contain an uppercase letter, a lowercase letter, a number, and a special character."
            );
            return;
        }

        try {
            setLoading(true);
            const response = await fetch(`http://10.0.2.2:5000/signUp`, { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userName: username.trim(),
                    email: email.trim(),
                    password: password
                }),
            });

            const data = await response.json();

            if (response.ok) {
                // 1. Check if your backend sent tokens back right after registration
                if (data.token || data.accessToken) {
                    const tokenToSave = data.token || data.accessToken;
                    await AsyncStorage.setItem('userToken', tokenToSave);
                }
                
                // 2. If your backend returns user profile information, save it too
                if (data.user) {
                    await AsyncStorage.setItem('userData', JSON.stringify(data.user));
                }

                // 3. Directly navigate to Dashboard, bypassing the Alert box entirely
                navigation.navigate("Dashboard");
            } else {
                Alert.alert("Sign Up Failed", data.error || "Could not create account.");
            }
        } catch (error) {
            Alert.alert("Error", "Could not connect to the server.");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeContainer}>
            <StatusBar barStyle="light-content" />
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.container}
            >
                <ScrollView 
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header Section */}
                    <View style={styles.headerContainer}>
                        <View style={styles.logoContainer}>
                            <Icon name="user-plus" size={40} color="#10b981" />
                        </View>
                        <Text style={styles.title}>Create Account</Text>
                        <Text style={styles.subtitle}>Start your fitness journey today</Text>
                    </View>

                    {/* Form Section */}
                    <View style={styles.formContainer}>
                        <View style={styles.inputWrapper}>
                            <Text style={styles.inputLabel}>Username</Text>
                            <View style={[
                                styles.inputContainer,
                                focusedInput === 'username' && styles.inputContainerFocused
                            ]}>
                                <Icon name="user" size={20} color={focusedInput === 'username' ? '#10b981' : '#64748b'} style={styles.icon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Username"
                                    placeholderTextColor="#64748b"
                                    value={username}
                                    onChangeText={setUsername}
                                    onFocus={() => setFocusedInput('username')}
                                    onBlur={() => setFocusedInput(null)}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    spellCheck={false}
                                    autoComplete="off"
                                    textContentType="none"
                                />
                            </View>
                        </View>

                        <View style={styles.inputWrapper}>
                            <Text style={styles.inputLabel}>Email</Text>
                            <View style={[
                                styles.inputContainer,
                                focusedInput === 'email' && styles.inputContainerFocused
                            ]}>
                                <Icon name="mail" size={20} color={focusedInput === 'email' ? '#10b981' : '#64748b'} style={styles.icon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Email Address"
                                    placeholderTextColor="#64748b"
                                    value={email}
                                    onChangeText={setEmail}
                                    onFocus={() => setFocusedInput('email')}
                                    onBlur={() => setFocusedInput(null)}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    autoCorrect={false}
                                    spellCheck={false}
                                    autoComplete="off"
                                    textContentType="none"
                                />
                            </View>
                        </View>

                        <View style={styles.inputWrapper}>
                            <Text style={styles.inputLabel}>Password</Text>
                            <View style={[
                                styles.inputContainer,
                                focusedInput === 'password' && styles.inputContainerFocused
                            ]}>
                                <Icon name="lock" size={20} color={focusedInput === 'password' ? '#10b981' : '#64748b'} style={styles.icon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Password (min 8 chars, 1 upper, 1 num, 1 spec)"
                                    placeholderTextColor="#64748b"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                    onFocus={() => setFocusedInput('password')}
                                    onBlur={() => setFocusedInput(null)}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    spellCheck={false}
                                    autoComplete="off"
                                    textContentType="none"
                                />
                                <TouchableOpacity 
                                    style={styles.eyeIcon}
                                    onPress={() => setShowPassword(!showPassword)}
                                >
                                    <Icon name={showPassword ? "eye" : "eye-off"} size={20} color="#64748b" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TouchableOpacity 
                            style={[styles.signupButton, loading && styles.signupButtonDisabled]}
                            onPress={handleSignUp}
                            disabled={loading}
                            activeOpacity={0.8}
                        >
                            {loading ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text style={styles.signupButtonText}>Sign Up</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Footer Section */}
                    <View style={styles.footerContainer}>
                        <Text style={styles.footerText}>Already have an account? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate("LoginPage")}>
                            <Text style={styles.footerLink}>Log In</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default SignUp;

const styles = StyleSheet.create({
    safeContainer: {
        flex: 1,
        backgroundColor: '#0f172a', 
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    headerContainer: {
        alignItems: 'center',
        marginBottom: 48,
        marginTop: 20,
    },
    logoContainer: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#ffffff',
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 16,
        color: '#94a3b8',
        fontWeight: '500',
    },
    formContainer: {
        width: '100%',
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#e2e8f0',
        marginBottom: 8,
        marginLeft: 4,
    },
    inputWrapper: {
        marginBottom: 16,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
        borderWidth: 1,
        borderColor: '#1e293b', 
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
    },
    inputContainerFocused: {
        borderColor: '#10b981', 
    },
    icon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        color: '#ffffff',
        fontSize: 14, 
    },
    eyeIcon: {
        padding: 8,
        marginRight: -8,
    },
    signupButton: {
        backgroundColor: '#10b981', 
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    signupButtonDisabled: {
        opacity: 0.7,
    },
    signupButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    footerContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 24,
    },
    footerText: {
        color: '#94a3b8',
        fontSize: 15,
    },
    footerLink: {
        color: '#10b981',
        fontSize: 15,
        fontWeight: '700',
    },
});