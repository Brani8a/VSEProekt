import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
    Platform,
    ScrollView,
    ActivityIndicator,
    Dimensions,
    Alert,
    LogBox
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Suppress warning boxes for seamless UI experience
LogBox.ignoreAllLogs();

const { width } = Dimensions.get('window');

const API_BASE_URL = Platform.OS === 'android' 
    ? 'http://10.0.2.2:5000' 
    : 'http://localhost:5000';

const UserDetailsSetupPage = ({ navigation }) => {
    // Multi-step Wizard Controller
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);

    // Question State values (mapped directly to backend enum constraints)
    const [sex, setSex] = useState('male'); // male | female | other
    const [age, setAge] = useState('');
    const [height, setHeight] = useState('');
    const [weight, setWeight] = useState('');
    const [bodyfat, setBodyfat] = useState('');
    const [goal, setGoal] = useState('hypertrophy'); // hypertrophy | fatloss | maintanence | strenght_gain | healthier_lifestyle
    
    // Aligned perfectly with TrainingLevelEnum backend values (preserving exact backend spelling)
    const [experience, setExperience] = useState('begginer'); // begginer | intermediate | advanced | elite
    const [injuries, setInjuries] = useState('');

    const totalSteps = 5;

    // Custom steps visual and texts settings
    const stepMeta = [
        { title: 'What is your sex?', subtitle: 'This helps us optimize calorie and performance metrics.' },
        { title: 'Tell us about yourself', subtitle: 'Enter your basic physiological measurements.' },
        { title: 'Current composition', subtitle: 'Your weight and estimated body fat percentage.' },
        { title: 'What is your main goal?', subtitle: 'We will target your workouts based on this choice.' },
        { title: 'Experience & History', subtitle: 'Help us match routines to your active training background.' },
    ];

    // Comprehensive client-side form validation step monitor
    const isStepValid = () => {
        switch (currentStep) {
            case 0:
                return !!sex;
            case 1:
                return age.trim().length > 0 && height.trim().length > 0 && !isNaN(age) && !isNaN(height);
            case 2:
                return weight.trim().length > 0 && bodyfat.trim().length > 0 && !isNaN(weight) && !isNaN(bodyfat);
            case 3:
                return !!goal;
            case 4:
                return !!experience;
            default:
                return false;
        }
    };

    const handleNext = () => {
        if (isStepValid()) {
            if (currentStep < totalSteps - 1) {
                setCurrentStep(currentStep + 1);
            } else {
                submitDetails();
            }
        } else {
            Alert.alert("Incomplete fields", "Please provide a valid entry for this question to continue.");
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    // Submits complete payload safely via authorization header tokens and path params
    const submitDetails = async () => {
        setLoading(true);
        try {
            // STEP 1: Securely extract auth token initialized at signup or login
            const token = await AsyncStorage.getItem('access_token');
            if (!token) {
                Alert.alert("Session Error", "Authentication credentials not found. Please log in again.");
                setLoading(false);
                return;
            }

            // Fallback default value processing for safe parameters delivery
            const cleanInjuries = injuries.trim() ? injuries.trim() : 'None';

            // STEP 2: Dynamically craft parameters corresponding with exact backend path segments
            const endpoint = `${API_BASE_URL}/set_user_details/${encodeURIComponent(weight)}/${encodeURIComponent(age)}/${encodeURIComponent(sex)}/${encodeURIComponent(height)}/${encodeURIComponent(goal)}/${encodeURIComponent(cleanInjuries)}/${encodeURIComponent(experience)}/${encodeURIComponent(bodyfat)}`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sex: sex,
                    goal: goal
                })
            });

            const result = await response.json();

            if (response.ok) {
                Alert.alert("Setup Complete!", "Your profile has been securely configured.", [
                    { text: "Let's Go", onPress: () => navigation.replace('ChatInboxPage') }
                ]);
            } else {
                Alert.alert("Server Error", result.error || "Could not update user settings.");
            }
        } catch (error) {
            console.error("Network initialization intercept failure:", error);
            Alert.alert("Connection Failure", "Unable to contact server. Check your backend status and try again.");
        } finally {
            setLoading(false);
        }
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 0: // Biological Sex Cards Choice View
                return (
                    <View style={styles.cardContainer}>
                        {['male', 'female', 'other'].map((item) => (
                            <TouchableOpacity
                                key={item}
                                style={[styles.selectorCard, sex === item && styles.selectorCardSelected]}
                                onPress={() => setSex(item)}
                                activeOpacity={0.7}
                            >
                                <Icon 
                                    name={item === 'male' ? 'shield' : item === 'female' ? 'heart' : 'user'} 
                                    size={24} 
                                    color={sex === item ? '#10b981' : '#64748b'} 
                                />
                                <Text style={[styles.selectorText, sex === item && styles.selectorTextSelected]}>
                                    {item.toUpperCase()}
                                </Text>
                                <View style={[styles.radioOutline, sex === item && styles.radioSelectedCircle]}>
                                    {sex === item && <View style={styles.radioInnerDot} />}
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                );

            case 1: // Age and Height Numeric Input Forms
                return (
                    <View style={styles.inputStepContainer}>
                        <Text style={styles.fieldLabel}>Current Age (years)</Text>
                        <View style={styles.inputWrapper}>
                            <Icon name="calendar" size={18} color="#64748b" style={styles.inputIcon} />
                            <TextInput
                                style={styles.textInput}
                                placeholder="e.g. 24"
                                placeholderTextColor="#475569"
                                keyboardType="numeric"
                                value={age}
                                onChangeText={setAge}
                                autoCorrect={false}
                                spellCheck={false}
                            />
                        </View>

                        <Text style={styles.fieldLabel}>Height (cm)</Text>
                        <View style={styles.inputWrapper}>
                            <Icon name="maximize-2" size={18} color="#64748b" style={styles.inputIcon} />
                            <TextInput
                                style={styles.textInput}
                                placeholder="e.g. 178"
                                placeholderTextColor="#475569"
                                keyboardType="numeric"
                                value={height}
                                onChangeText={setHeight}
                                autoCorrect={false}
                                spellCheck={false}
                            />
                        </View>
                    </View>
                );

            case 2: // Body Composition Metrics Form
                return (
                    <View style={styles.inputStepContainer}>
                        <Text style={styles.fieldLabel}>Body Weight (kg)</Text>
                        <View style={styles.inputWrapper}>
                            <Icon name="activity" size={18} color="#64748b" style={styles.inputIcon} />
                            <TextInput
                                style={styles.textInput}
                                placeholder="e.g. 82"
                                placeholderTextColor="#475569"
                                keyboardType="numeric"
                                value={weight}
                                onChangeText={setWeight}
                                autoCorrect={false}
                                spellCheck={false}
                            />
                        </View>

                        <Text style={styles.fieldLabel}>Estimated Body Fat Percentage (%)</Text>
                        <View style={styles.inputWrapper}>
                            <Icon name="pie-chart" size={18} color="#64748b" style={styles.inputIcon} />
                            <TextInput
                                style={styles.textInput}
                                placeholder="e.g. 14"
                                placeholderTextColor="#475569"
                                keyboardType="numeric"
                                value={bodyfat}
                                onChangeText={setBodyfat}
                                autoCorrect={false}
                                spellCheck={false}
                            />
                        </View>
                    </View>
                );

            case 3: // Advanced Fitness Goal Enum Mappings
                const goalsMapping = [
                    { id: 'hypertrophy', label: 'Muscle Growth (Hypertrophy)' },
                    { id: 'fatloss', label: 'Fat Loss & Shredding' },
                    { id: 'maintanence', label: 'Maintain Composition' },
                    { id: 'strenght_gain', label: 'Power & Strength Gain' },
                    { id: 'healthier_lifestyle', label: 'Healthier Lifestyle Habits' }
                ];
                return (
                    <ScrollView contentContainerStyle={styles.scrollCardContainer} showsVerticalScrollIndicator={false}>
                        {goalsMapping.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.selectorCard, goal === item.id && styles.selectorCardSelected]}
                                onPress={() => setGoal(item.id)}
                                activeOpacity={0.7}
                            >
                                <Icon name="target" size={20} color={goal === item.id ? '#10b981' : '#64748b'} />
                                <Text style={[styles.selectorText, goal === item.id && styles.selectorTextSelected]}>
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                );

            case 4: // Training Experience & Limitations Matrix View
                const experienceOptions = [
                    { id: 'begginer', display: 'Beginner' },
                    { id: 'intermediate', display: 'Intermediate' },
                    { id: 'advanced', display: 'Advanced' },
                    { id: 'elite', display: 'Elite Athletes' }
                ];
                return (
                    <ScrollView contentContainerStyle={styles.inputStepContainer} showsVerticalScrollIndicator={false}>
                        <Text style={styles.fieldLabel}>Training Experience Level</Text>
                        <View style={styles.expGridContainer}>
                            {experienceOptions.map((opt) => (
                                <TouchableOpacity
                                    key={opt.id}
                                    style={[styles.expGridTab, experience === opt.id && styles.expGridTabActive]}
                                    onPress={() => setExperience(opt.id)}
                                    activeOpacity={0.8}
                                >
                                    <Icon 
                                        name={opt.id === 'elite' ? 'award' : 'trending-up'} 
                                        size={16} 
                                        color={experience === opt.id ? '#ffffff' : '#64748b'} 
                                        style={{ marginBottom: 4 }}
                                    />
                                    <Text style={[styles.expGridTabText, experience === opt.id && styles.expGridTabTextActive]}>
                                        {opt.display}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.fieldLabel}>Active Injuries or Limitations (Optional)</Text>
                        <View style={[styles.inputWrapper, styles.multilineWrapper]}>
                            <TextInput
                                style={[styles.textInput, styles.multilineInput]}
                                placeholder="Describe any current physical limitations or specific joint issues. Leave blank if perfectly healthy."
                                placeholderTextColor="#475569"
                                multiline={true}
                                numberOfLines={4}
                                value={injuries}
                                onChangeText={setInjuries}
                                autoCorrect={false}
                                spellCheck={false}
                            />
                        </View>
                    </ScrollView>
                );
            default:
                return null;
        }
    };

    const progressPercent = ((currentStep + 1) / totalSteps) * 100;

    return (
        <SafeAreaView style={styles.safeContainer}>
            <StatusBar barStyle="light-content" />

            {/* Application Visual Breadcrumb Row */}
            <View style={styles.headerContainer}>
                <TouchableOpacity 
                    onPress={handleBack} 
                    disabled={currentStep === 0}
                    style={[styles.backAction, currentStep === 0 && styles.backActionDisabled]}
                >
                    <Icon name="arrow-left" size={20} color={currentStep === 0 ? '#334155' : '#ffffff'} />
                </TouchableOpacity>
                <Text style={styles.headerStepCounter}>Step {currentStep + 1} of {totalSteps}</Text>
                <View style={styles.placeholderNode} />
            </View>

            {/* Immersive Layout Progress Indicator Bar */}
            <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>

            {/* Dynamic Interactive Prompt Block */}
            <View style={styles.metaPromptBlock}>
                <Text style={styles.promptTitle}>{stepMeta[currentStep].title}</Text>
                <Text style={styles.promptSubtitle}>{stepMeta[currentStep].subtitle}</Text>
            </View>

            {/* Core Wizard Question Display Box */}
            <View style={styles.interactiveArea}>
                {renderStepContent()}
            </View>

            {/* Unified Footer Actions Module */}
            <View style={styles.footerBar}>
                <TouchableOpacity
                    style={[styles.actionButton, !isStepValid() && styles.actionButtonDisabled]}
                    onPress={handleNext}
                    disabled={loading || !isStepValid()}
                    activeOpacity={0.8}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                        <Text style={styles.actionButtonText}>
                            {currentStep === totalSteps - 1 ? 'COMPLETE ONBOARDING' : 'NEXT QUESTION'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default UserDetailsSetupPage;

const styles = StyleSheet.create({
    safeContainer: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 12 : 24,
        paddingBottom: 12,
    },
    backAction: {
        padding: 8,
        borderRadius: 10,
        backgroundColor: '#1e293b',
    },
    backActionDisabled: {
        backgroundColor: 'transparent',
    },
    headerStepCounter: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b',
        letterSpacing: 0.5,
    },
    placeholderNode: {
        width: 36,
    },
    progressBarTrack: {
        height: 4,
        backgroundColor: '#1e293b',
        width: '100%',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#10b981',
        borderRadius: 2,
    },
    metaPromptBlock: {
        paddingHorizontal: 24,
        paddingTop: 28,
        paddingBottom: 16,
    },
    promptTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#ffffff',
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    promptSubtitle: {
        fontSize: 15,
        color: '#94a3b8',
        lineHeight: 22,
    },
    interactiveArea: {
        flex: 1,
        paddingHorizontal: 24,
        justifyContent: 'center',
    },
    cardContainer: {
        gap: 16,
    },
    scrollCardContainer: {
        gap: 14,
        paddingVertical: 10,
    },
    selectorCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        borderWidth: 1.5,
        borderColor: '#334155',
        borderRadius: 16,
        paddingHorizontal: 20,
        height: 64,
    },
    selectorCardSelected: {
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
    },
    selectorText: {
        flex: 1,
        marginLeft: 14,
        fontSize: 16,
        fontWeight: '600',
        color: '#94a3b8',
    },
    selectorTextSelected: {
        color: '#ffffff',
    },
    radioOutline: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#475569',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioSelectedCircle: {
        borderColor: '#10b981',
    },
    radioInnerDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#10b981',
    },
    inputStepContainer: {
        width: '100%',
    },
    fieldLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#94a3b8',
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        borderWidth: 1.5,
        borderColor: '#334155',
        borderRadius: 14,
        paddingHorizontal: 16,
        height: 54,
        marginBottom: 24,
    },
    inputIcon: {
        marginRight: 12,
    },
    textInput: {
        flex: 1,
        color: '#ffffff',
        fontSize: 16,
        height: '100%',
    },
    expGridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 28,
    },
    expGridTab: {
        width: (width - 60) / 2, // Perfect mathematical division for clean responsive columns spacing
        height: 72,
        borderRadius: 14,
        backgroundColor: '#1e293b',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#334155',
        padding: 8,
    },
    expGridTabActive: {
        backgroundColor: '#10b981',
        borderColor: '#10b981',
    },
    expGridTabText: {
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
    expGridTabTextActive: {
        color: '#ffffff',
        fontWeight: '700',
    },
    multilineWrapper: {
        height: 110,
        alignItems: 'flex-start',
        paddingVertical: 12,
    },
    multilineInput: {
        textAlignVertical: 'top',
        height: '100%',
    },
    footerBar: {
        paddingHorizontal: 24,
        paddingBottom: Platform.OS === 'ios' ? 30 : 24,
        paddingTop: 16,
    },
    actionButton: {
        backgroundColor: '#10b981',
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    actionButtonDisabled: {
        backgroundColor: '#1e293b',
        shadowOpacity: 0,
        elevation: 0,
        opacity: 0.5,
    },
    actionButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});