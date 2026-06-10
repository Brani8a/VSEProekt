import React, { useState, useEffect, useRef } from 'react';
import { 
    View, Text, ScrollView, TouchableOpacity, ActivityIndicator, 
    SafeAreaView, Alert, TextInput, Modal, KeyboardAvoidingView, Platform, StyleSheet 
} from 'react-native';
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import Feather from 'react-native-vector-icons/Feather';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Storage Fallback
if (!global.appMemoryStorage) { global.appMemoryStorage = {}; }
const AsyncStorage = {
    setItem: async (key, val) => { global.appMemoryStorage[key] = String(val); return true; },
    getItem: async (key) => { return global.appMemoryStorage[key] || null; },
    removeItem: async (key) => { delete global.appMemoryStorage[key]; return true; }
};

const BASE_URL = "http://192.168.1.100:5000"; // REPLACE WITH YOUR BACKEND IP

const WorkoutsPage = () => {
    const navigation = useNavigation();

    // Views: 'HUB' | 'ACTIVE' | 'SUMMARY'
    const [currentView, setCurrentView] = useState('HUB');
    const [loading, setLoading] = useState(true);

    const [recentWorkouts, setRecentWorkouts] = useState([]);
    const [savedTemplates, setSavedTemplates] = useState([]);

    const [activeWorkoutId, setActiveWorkoutId] = useState(null);
    const [activeExercises, setActiveExercises] = useState([]);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const timerRef = useRef(null);

    const [isAddModalVisible, setAddModalVisible] = useState(false);
    const [exForm, setExForm] = useState({ name: '', sets: '', reps: '', weight: '', desc: 'None' });
    const [summaryData, setSummaryData] = useState(null);

    useFocusEffect(
        React.useCallback(() => {
            checkActiveSession();
        }, [])
    );

    const checkActiveSession = async () => {
        setLoading(true);
        try {
            const activeId = await AsyncStorage.getItem("activeWorkoutId");
            const startTimeStr = await AsyncStorage.getItem("workoutStartTime");
            
            if (activeId && startTimeStr) {
                setActiveWorkoutId(activeId);
                const startTime = parseInt(startTimeStr, 10);
                setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
                await fetchActiveExercises(activeId);
                setCurrentView('ACTIVE');
                startTimer();
            } else {
                setCurrentView('HUB');
                await fetchHubData();
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchHubData = async () => {
        const token = await AsyncStorage.getItem("token");
        if (!token) return navigation.replace("Login");

        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        
        try {
            const [recentRes, savedRes] = await Promise.all([
                fetch(`${BASE_URL}/retrieve_recent_workouts?page=1&limit=5`, { headers }),
                fetch(`${BASE_URL}/list_saved_wk`, { headers })
            ]);

            if (recentRes.ok) {
                const data = await recentRes.json();
                setRecentWorkouts(Array.isArray(data) ? data : (data.workouts || []));
            }
            if (savedRes.ok) {
                const data = await savedRes.json();
                setSavedTemplates(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.log(error);
        }
    };

    const fetchActiveExercises = async (workoutId) => {
        const token = await AsyncStorage.getItem("token");
        try {
            const res = await fetch(`${BASE_URL}/list_workout_data/${workoutId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setActiveExercises(data.excersizes || []); 
            }
        } catch (error) {
            console.log(error);
        }
    };

    const startWorkout = async (type = "Custom", duration = 60, notes = "None") => {
        setLoading(true);
        const token = await AsyncStorage.getItem("token");
        
        try {
            const res = await fetch(`${BASE_URL}/log_workout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration, type, notes })
            });

            if (res.ok) {
                const data = await res.json();
                const newWorkoutId = data.workout_id;
                
                await AsyncStorage.setItem("activeWorkoutId", newWorkoutId.toString());
                await AsyncStorage.setItem("workoutStartTime", Date.now().toString());
                
                setActiveWorkoutId(newWorkoutId);
                setActiveExercises([]);
                setElapsedSeconds(0);
                setCurrentView('ACTIVE');
                startTimer();
            } else {
                Alert.alert("Error", "Could not start workout.");
            }
        } catch (error) {
            Alert.alert("Error", "Network Error");
        } finally {
            setLoading(false);
        }
    };

    const submitExercise = async () => {
        if (!exForm.name || !exForm.sets || !exForm.reps || !exForm.weight) {
            Alert.alert("Error", "Please fill out all fields.");
            return;
        }

        const token = await AsyncStorage.getItem("token");
        try {
            const url = `${BASE_URL}/add_excersize/${activeWorkoutId}/${exForm.name}/${exForm.sets}/${exForm.reps}/${exForm.weight}/${exForm.desc}`;
            const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });

            if (res.ok) {
                setAddModalVisible(false);
                setExForm({ name: '', sets: '', reps: '', weight: '', desc: 'None' });
                fetchActiveExercises(activeWorkoutId);
            } else {
                Alert.alert("Error", "Failed to add exercise.");
            }
        } catch (error) {
            Alert.alert("Error", "Network error.");
        }
    };

    const finishWorkout = async () => {
        Alert.alert(
            "Finish Workout", "End this session?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Finish", style: "default", onPress: async () => {
                    clearInterval(timerRef.current);
                    setLoading(true);
                    const token = await AsyncStorage.getItem("token");
                    
                    try {
                        const res = await fetch(`${BASE_URL}/finish_workout/${activeWorkoutId}`, {
                            method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
                        });
                        
                        if (res.ok) {
                            const resultData = await res.json();
                            setSummaryData(resultData);
                            await AsyncStorage.removeItem("activeWorkoutId");
                            await AsyncStorage.removeItem("workoutStartTime");
                            setCurrentView('SUMMARY');
                        }
                    } catch (error) {
                        Alert.alert("Error", "Could not finish.");
                    } finally {
                        setLoading(false);
                    }
                }}
            ]
        );
    };

    const startTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => { setElapsedSeconds(prev => prev + 1); }, 1000);
    };

    const formatTime = (totalSeconds) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        return hrs > 0 
            ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // --------------------------------------------------------
    // RENDERERS
    // --------------------------------------------------------
    const renderHub = () => (
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Workouts</Text>
                <TouchableOpacity style={styles.iconButton}>
                    <Feather name="message-circle" size={24} color="#10b981" />
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={() => startWorkout()}>
                <Ionicons name="add-circle-outline" size={24} color="#fff" style={styles.btnIcon} />
                <Text style={styles.primaryButtonText}>Start Empty Session</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Saved Routines</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                {savedTemplates.length > 0 ? savedTemplates.map((item, index) => (
                    <TouchableOpacity key={index} style={styles.templateCard}>
                        <Feather name="bookmark" size={20} color="#10b981" style={{ marginBottom: 8 }} />
                        <Text style={styles.templateTitle} numberOfLines={1}>{item.type || "Template"}</Text>
                    </TouchableOpacity>
                )) : (
                    <Text style={styles.emptyText}>No saved templates yet.</Text>
                )}
            </ScrollView>

            <Text style={styles.sectionTitle}>Recent History</Text>
            {recentWorkouts.length > 0 ? recentWorkouts.map((workout, index) => (
                <View key={index} style={styles.historyCard}>
                    <View style={styles.historyRow}>
                        <Text style={styles.historyTitle}>{workout.type}</Text>
                        <Text style={styles.historyDuration}>{workout.duration_min}m</Text>
                    </View>
                    <Text style={styles.historyDate}>{new Date(workout.created_at).toLocaleDateString()}</Text>
                    <TouchableOpacity style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>View Details</Text>
                    </TouchableOpacity>
                </View>
            )) : (
                <Text style={styles.emptyText}>No recent workouts found.</Text>
            )}
        </ScrollView>
    );

    const renderActiveWorkout = () => (
        <View style={styles.activeContainer}>
            <View style={styles.activeHeader}>
                <View>
                    <Text style={styles.activeLabel}>SESSION IN PROGRESS</Text>
                    <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
                </View>
                <TouchableOpacity style={styles.finishButton} onPress={finishWorkout}>
                    <Text style={styles.finishButtonText}>FINISH</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
                {activeExercises.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Feather name="inbox" size={48} color="#475569" style={{marginBottom: 16}} />
                        <Text style={styles.emptyText}>No exercises added yet.</Text>
                    </View>
                ) : (
                    activeExercises.map((ex, idx) => (
                        <View key={idx} style={styles.exerciseCard}>
                            <Text style={styles.exerciseName}>{ex.name}</Text>
                            <View style={styles.exerciseStatsRow}>
                                <View style={styles.statBox}><Text style={styles.statLabel}>SETS</Text><Text style={styles.statValue}>{ex.sets}</Text></View>
                                <View style={styles.statBox}><Text style={styles.statLabel}>REPS</Text><Text style={styles.statValue}>{ex.reps}</Text></View>
                                <View style={styles.statBox}><Text style={styles.statLabel}>LBS/KG</Text><Text style={styles.statValuePrimary}>{ex.weight}</Text></View>
                            </View>
                        </View>
                    ))
                )}

                <TouchableOpacity style={styles.addExerciseButton} onPress={() => setAddModalVisible(true)}>
                    <Feather name="plus" size={24} color="#10b981" />
                    <Text style={styles.addExerciseText}>ADD EXERCISE</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );

    const renderSummary = () => (
        <View style={styles.summaryContainer}>
            <View style={styles.summaryCard}>
                <Ionicons name="trophy" size={64} color="#10b981" style={{marginBottom: 16}} />
                <Text style={styles.summaryTitle}>Workout Complete!</Text>
                <Text style={styles.summarySubtitle}>Great job pushing your limits.</Text>

                <View style={styles.summaryStatsBox}>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Total Volume</Text>
                        <Text style={styles.summaryValue}>{summaryData?.volume || 0} kg</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Overload Achieved</Text>
                        <Text style={summaryData?.achieved_overload ? styles.summarySuccess : styles.summaryWarning}>
                            {summaryData?.achieved_overload ? "Yes!" : "Maintained"}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={() => { setCurrentView('HUB'); fetchHubData(); }}>
                    <Text style={styles.primaryButtonText}>Back to Hub</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            {loading && currentView === 'HUB' ? (
                <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#10b981" /></View>
            ) : (
                <>
                    {currentView === 'HUB' && renderHub()}
                    {currentView === 'ACTIVE' && renderActiveWorkout()}
                    {currentView === 'SUMMARY' && renderSummary()}
                </>
            )}

            {/* Bottom Nav Bar - Exact styling from DashboardPage */}
            {currentView === 'HUB' && (
                <View style={styles.bottomNav}>
                    <TouchableOpacity style={styles.navItemOpacity} onPress={() => navigation.navigate("Dashboard")}>
                        <Feather name="home" size={24} color="#4B5563" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.navItemActive}>
                        <Ionicons name="barbell-outline" size={26} color="#10b981" />
                        <View style={styles.navDot} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.navItemOpacity} onPress={() => navigation.navigate("Macros")}>
                        <Feather name="pie-chart" size={24} color="#4B5563" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.navItemOpacity} onPress={() => navigation.navigate("Profile")}>
                        <Feather name="user" size={24} color="#4B5563" />
                    </TouchableOpacity>
                </View>
            )}

            {/* Add Exercise Modal - Styled like Signup Inputs */}
            <Modal visible={isAddModalVisible} animationType="slide" transparent={true}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add Exercise</Text>
                            <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                                <Feather name="x" size={28} color="#94a3b8" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.inputContainer}>
                            <TextInput 
                                style={styles.input} placeholder="Exercise Name" placeholderTextColor="#64748b"
                                value={exForm.name} onChangeText={(t) => setExForm({...exForm, name: t})}
                            />
                        </View>
                        
                        <View style={styles.rowInputs}>
                            <View style={[styles.inputContainer, {flex: 1, marginRight: 8}]}>
                                <TextInput style={styles.input} placeholder="Sets" placeholderTextColor="#64748b" keyboardType="numeric" value={exForm.sets} onChangeText={(t) => setExForm({...exForm, sets: t})} />
                            </View>
                            <View style={[styles.inputContainer, {flex: 1, marginRight: 8}]}>
                                <TextInput style={styles.input} placeholder="Reps" placeholderTextColor="#64748b" keyboardType="numeric" value={exForm.reps} onChangeText={(t) => setExForm({...exForm, reps: t})} />
                            </View>
                            <View style={[styles.inputContainer, {flex: 1}]}>
                                <TextInput style={styles.input} placeholder="Weight" placeholderTextColor="#64748b" keyboardType="numeric" value={exForm.weight} onChangeText={(t) => setExForm({...exForm, weight: t})} />
                            </View>
                        </View>

                        <TouchableOpacity style={styles.primaryButton} onPress={submitExercise}>
                            <Text style={styles.primaryButtonText}>Add to Session</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
};

// ==========================================
// STYLESHEET EXCLUSIVELY
// Matches SignupPage.js and LoginPage.js
// ==========================================
const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#0f172a', // Main dark background
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    scrollContent: {
        paddingTop: 24,
        paddingBottom: 120, // Space for bottom nav
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    iconButton: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        padding: 12,
        borderRadius: 50,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 16,
        marginTop: 8,
    },
    emptyText: {
        color: '#94a3b8',
        fontStyle: 'italic',
        marginBottom: 32,
    },
    // Buttons
    primaryButton: {
        backgroundColor: '#10b981',
        height: 56,
        borderRadius: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
        width: '100%',
    },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    btnIcon: {
        marginRight: 8,
    },
    secondaryButton: {
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: '#10b981',
        fontWeight: '600',
    },
    // Cards
    horizontalScroll: {
        marginBottom: 32,
    },
    templateCard: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 16,
        marginRight: 16,
        width: 160,
        borderWidth: 1,
        borderColor: '#334155',
    },
    templateTitle: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    historyCard: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    historyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    historyTitle: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 18,
    },
    historyDuration: {
        color: '#10b981',
        fontWeight: 'bold',
    },
    historyDate: {
        color: '#94a3b8',
        fontSize: 14,
        marginBottom: 16,
    },
    // Active Workout Screen
    activeContainer: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    activeHeader: {
        paddingHorizontal: 16,
        paddingTop: 24,
        paddingBottom: 16,
        backgroundColor: '#1e293b',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        elevation: 4,
    },
    activeLabel: {
        color: '#10b981',
        fontWeight: 'bold',
        fontSize: 12,
        letterSpacing: 1,
        marginBottom: 4,
    },
    timerText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    finishButton: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    finishButtonText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    exerciseCard: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    exerciseName: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 18,
        marginBottom: 12,
    },
    exerciseStatsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#0f172a',
        padding: 12,
        borderRadius: 12,
    },
    statBox: {
        alignItems: 'center',
    },
    statLabel: {
        color: '#94a3b8',
        fontSize: 12,
        marginBottom: 4,
    },
    statValue: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 18,
    },
    statValuePrimary: {
        color: '#10b981',
        fontWeight: 'bold',
        fontSize: 18,
    },
    addExerciseButton: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        borderColor: '#10b981',
        borderStyle: 'dashed',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginTop: 8,
    },
    addExerciseText: {
        color: '#10b981',
        fontWeight: 'bold',
        marginTop: 8,
    },
    // Summary Screen
    summaryContainer: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    summaryCard: {
        backgroundColor: '#1e293b',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155',
        width: '100%',
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    summaryTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 8,
    },
    summarySubtitle: {
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: 32,
    },
    summaryStatsBox: {
        width: '100%',
        backgroundColor: '#0f172a',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    summaryLabel: {
        color: '#94a3b8',
        fontSize: 16,
    },
    summaryValue: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    summarySuccess: {
        color: '#10b981',
        fontWeight: 'bold',
        fontSize: 16,
    },
    summaryWarning: {
        color: '#f59e0b',
        fontWeight: 'bold',
        fontSize: 16,
    },
    // Modal & Inputs (Matches SignupPage.js)
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modalContent: {
        backgroundColor: '#1e293b',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    inputContainer: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
        borderWidth: 1,
        borderColor: '#334155', 
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        justifyContent: 'center',
        marginBottom: 16,
    },
    input: {
        flex: 1,
        color: '#ffffff',
        fontSize: 14, 
    },
    rowInputs: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    // Bottom Navigation (Matches DashboardPage)
    bottomNav: {
        position: 'absolute',
        bottom: 24,
        left: 24,
        right: 24,
        backgroundColor: '#ffffff',
        borderRadius: 50,
        paddingVertical: 16,
        paddingHorizontal: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    navItemOpacity: {
        alignItems: 'center',
        opacity: 0.5,
    },
    navItemActive: {
        alignItems: 'center',
    },
    navDot: {
        width: 6,
        height: 6,
        backgroundColor: '#10b981',
        borderRadius: 3,
        marginTop: 4,
    }
});

export default WorkoutsPage;