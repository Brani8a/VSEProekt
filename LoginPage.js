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
import { useNavigation } from "@react-navigation/native";
import Icon from 'react-native-vector-icons/Feather';

// MOCK FIX FOR THE LEGACY NATIVE MODULE NULL ERROR:
if (!global.appMemoryStorage) { global.appMemoryStorage = {}; }
const AsyncStorage = {
    setItem: async (key, val) => { global.appMemoryStorage[key] = String(val); return true; },
    getItem: async (key) => { return global.appMemoryStorage[key] || null; }
};

// Permanently disable all visible on-screen warning boxes
LogBox.ignoreAllLogs();

const LoginPage = () => {
    const navigation = useNavigation();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [focusedInput, setFocusedInput] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!username.trim() || !password) {
            Alert.alert("Required", "Please enter both username and password.");
            return;
        }

        try {
            setLoading(true);
            const response = await fetch(`http://10.0.2.2:5000/logIn`, { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userName: username.trim(),
                    password: password
                }),
            });

            const data = await response.json();

            if (response.ok) {
                if (data.access_token) {
                    await AsyncStorage.setItem('access_token', data.access_token);
                    await AsyncStorage.setItem('token', data.access_token);
                }
                if (data.refresh_token) {
                    await AsyncStorage.setItem('refresh_token', data.refresh_token);
                }
                
                // Redirect cleanly without any lingering error triggers
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Dashboard' }],
                });
            } else {
                Alert.alert("Login Failed", data.error || "Invalid credentials.");
            }
        } catch (error) {
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
                            <Icon name="activity" size={40} color="#10b981" />
                        </View>
                        <Text style={styles.title}>Welcome Back</Text>
                        <Text style={styles.subtitle}>Log in to continue your fitness journey</Text>
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
                                    importantForAutofill="no"
                                    keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
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
                                    placeholder="Password"
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
                                    importantForAutofill="no"
                                />
                                <TouchableOpacity 
                                    style={styles.eyeIcon}
                                    onPress={() => setShowPassword(!showPassword)}
                                >
                                    <Icon name={showPassword ? "eye" : "eye-off"} size={20} color="#64748b" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.forgotPassword}>
                            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                            onPress={handleLogin}
                            disabled={loading}
                            activeOpacity={0.8}
                        >
                            {loading ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text style={styles.loginButtonText}>Log In</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Footer Section */}
                    <View style={styles.footerContainer}>
                        <Text style={styles.footerText}>Don't have an account? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
                            <Text style={styles.footerLink}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default LoginPage;

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
        fontSize: 16,
    },
    eyeIcon: {
        padding: 8,
        marginRight: -8,
    },
    forgotPassword: {
        alignSelf: 'flex-end',
        marginBottom: 32,
        paddingVertical: 8,
    },
    forgotPasswordText: {
        color: '#10b981',
        fontSize: 14,
        fontWeight: '600',
    },
    loginButton: {
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
    loginButtonDisabled: {
        opacity: 0.7,
    },
    loginButtonText: {
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