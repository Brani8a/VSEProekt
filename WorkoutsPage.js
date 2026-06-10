import React, { useState, useEffect, useRef } from 'react';
import { 
    View, 
    Text, 
    ScrollView, 
    TouchableOpacity, 
    ActivityIndicator, 
    SafeAreaView, 
    Alert, 
    TextInput, 
    Modal, 
    KeyboardAvoidingView, 
    Platform, 
    StyleSheet, 
    FlatList 
} from 'react-native';
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import Feather from 'react-native-vector-icons/Feather';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Storage Fallback Engine
if (!global.appMemoryStorage) { global.appMemoryStorage = {}; }
const AsyncStorage = {
    setItem: async (key, val) => { global.appMemoryStorage[key] = String(val); return true; },
    getItem: async (key) => { return global.appMemoryStorage[key] || null; },
    removeItem: async (key) => { delete global.appMemoryStorage[key]; return true; }
};

const BASE_URL = "http://192.168.1.100:5000"; // Update with your active backend configuration IP
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

// ==========================================
// MASSIVE MOCK DATA FOR INSTANT VISUALIZATION
// ==========================================
const MOCK_SAVED_TEMPLATES = [
    { workout_id: 101, type: "Push Day (Hypertrophy)", duration_min: 65 },
    { workout_id: 102, type: "Pull Day (Strength)", duration_min: 70 },
    { workout_id: 103, type: "Legs & Core Devastation", duration_min: 75 },
    { workout_id: 104, type: "Upper Body Power", duration_min: 60 },
    { workout_id: 105, type: "Full Body Conditioning", duration_min: 50 },
    { workout_id: 106, type: "Arm Pump Special", duration_min: 45 }
];

const MOCK_RECENT_HISTORY = [
    { id: 1, type: "Push Day (Hypertrophy)", duration_min: 64, created_at: "2026-06-09T18:30:00.000Z" },
    { id: 2, type: "Pull Day (Strength)", duration_min: 72, created_at: "2026-06-07T19:15:00.000Z" },
    { id: 3, type: "Legs & Core Devastation", duration_min: 80, created_at: "2026-06-05T17:00:00.000Z" },
    { id: 4, type: "Upper Body Power", duration_min: 58, created_at: "2026-06-04T12:30:00.000Z" },
    { id: 5, type: "Cardio & Abs", duration_min: 45, created_at: "2026-06-02T08:00:00.000Z" },
    { id: 6, type: "Push Day (Hypertrophy)", duration_min: 68, created_at: "2026-05-31T20:00:00.000Z" },
    { id: 7, type: "Pull Day (Strength)", duration_min: 65, created_at: "2026-05-29T16:45:00.000Z" },
    { id: 8, type: "Legs Heavy Build", duration_min: 90, created_at: "2026-05-27T15:00:00.000Z" }
];

const MOCK_ACTIVE_EXERCISES = [
    { name: "Barbell Bench Press", sets: 4, reps: 8, weight: 100, desc: "Focus on slow eccentrics" },
    { name: "Incline Dumbbell Press", sets: 3, reps: 10, weight: 36, desc: "30 degree incline bench" },
    { name: "Overhead Barbell Press", sets: 4, reps: 6, weight: 60, desc: "Keep core locked tight" },
    { name: "Dips (Weighted)", sets: 3, reps: 12, weight: 15, desc: "Leaning forward for chest focus" }
];

const WorkoutsPage = () => {
    const navigation = useNavigation();

    const [currentView, setCurrentView] = useState('HUB');
    const [backgroundSyncing, setBackgroundSyncing] = useState(false);

    const [recentWorkouts, setRecentWorkouts] = useState(MOCK_RECENT_HISTORY);
    const [savedTemplates, setSavedTemplates] = useState(MOCK_SAVED_TEMPLATES);
    const [activeExercises, setActiveExercises] = useState(MOCK_ACTIVE_EXERCISES);

    // Infinite Scroll State
    const [historyPage, setHistoryPage] = useState(1);
    const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);

    const [activeWorkoutId, setActiveWorkoutId] = useState(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const timerRef = useRef(null);
    const liveExercisesFetched = useRef(false);

    // Modals & Forms (DURATION REMOVED FROM SETUP FORM)
    const [isSetupModalVisible, setSetupModalVisible] = useState(false);
    const [setupForm, setSetupForm] = useState({ type: '', notes: '' });

    const [isAddModalVisible, setAddModalVisible] = useState(false);
    const [exForm, setExForm] = useState({ name: '', sets: '', reps: '', weight: '', desc: 'None' });
    
    const [summaryData, setSummaryData] = useState(null);

    useFocusEffect(
        React.useCallback(() => {
            checkActiveSessionSilently();
            return () => {
                if (timerRef.current) clearInterval(timerRef.current);
            };
        }, [])
    );

    const checkActiveSessionSilently = async () => {
        try {
            const activeId = await AsyncStorage.getItem("activeWorkoutId");
            const startTimeStr = await AsyncStorage.getItem("workoutStartTime");
            
            if (activeId && startTimeStr) {
                const parsedId = parseInt(activeId, 10);
                setActiveWorkoutId(parsedId);
                const startTime = parseInt(startTimeStr, 10);
                setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
                setCurrentView('ACTIVE');
                startTimer();
                
                if (!liveExercisesFetched.current) {
                    fetchActiveExercises(parsedId);
                }
            } else {
                setCurrentView('HUB');
                fetchHubDataSilently();
            }
        } catch (error) {
            console.error("Session matching error: ", error);
        }
    };

    // --- HUB DATA & PAGINATION ---
    const fetchHubDataSilently = async () => {
        const token = await AsyncStorage.getItem("token");
        if (!token) return;

        const lastSync = await AsyncStorage.getItem("lastWorkoutSyncTime");
        const isDirty = await AsyncStorage.getItem("workoutDataDirty");
        const now = Date.now();
        
        if (isDirty !== 'true' && lastSync && (now - parseInt(lastSync, 10)) < SYNC_COOLDOWN_MS && historyPage === 1) {
            return; // Skip if fresh
        }

        setBackgroundSyncing(true);
        try {
            const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
            const [recentRes, savedRes] = await Promise.all([
                fetch(`${BASE_URL}/retrieve_recent_workouts?page=1&limit=10`, { headers }),
                fetch(`${BASE_URL}/list_saved_wk`, { headers })
            ]);

            if (recentRes.ok) {
                const data = await recentRes.json();
                const fetchedList = Array.isArray(data) ? data : (data.workouts || []);
                if (fetchedList.length > 0) {
                    setRecentWorkouts(fetchedList);
                    setHistoryPage(1);
                    setHasMoreHistory(fetchedList.length === 10);
                }
            }
            if (savedRes.ok) {
                const data = await savedRes.json();
                if (Array.isArray(data) && data.length > 0) setSavedTemplates(data);
            }

            await AsyncStorage.setItem("lastWorkoutSyncTime", Date.now().toString());
            await AsyncStorage.setItem("workoutDataDirty", "false"); 

        } catch (error) {
            console.log("Using cached hub data.");
        } finally {
            setBackgroundSyncing(false);
        }
    };

    const loadMoreHistory = async () => {
        if (!hasMoreHistory || loadingMoreHistory) return;
        
        setLoadingMoreHistory(true);
        const nextPage = historyPage + 1;
        const token = await AsyncStorage.getItem("token");

        try {
            const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
            const res = await fetch(`${BASE_URL}/retrieve_recent_workouts?page=${nextPage}&limit=10`, { headers });
            
            if (res.ok) {
                const data = await res.json();
                const fetchedList = Array.isArray(data) ? data : (data.workouts || []);
                if (fetchedList.length > 0) {
                    setRecentWorkouts(prev => [...prev, ...fetchedList]);
                    setHistoryPage(nextPage);
                    setHasMoreHistory(fetchedList.length === 10);
                } else {
                    setHasMoreHistory(false);
                }
            }
        } catch (error) {
            console.log("Failed to load more history");
        } finally {
            setLoadingMoreHistory(false);
        }
    };

    const fetchActiveExercises = async (workoutId) => {
        const token = await AsyncStorage.getItem("token");
        if (!token) return;
        try {
            const res = await fetch(`${BASE_URL}/list_workout_data/${workoutId}`, { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            if (res.ok) {
                const data = await res.json();
                if (data.excersizes) {
                    setActiveExercises(data.excersizes); 
                    liveExercisesFetched.current = true;
                }
            }
        } catch (error) {
            console.log("Using mock active session stack.");
        }
    };

    // --- WORKOUT INITIALIZATION & ACTIONS ---
    const triggerStartEmptySession = () => {
        setSetupForm({ type: '', notes: '' }); // Duration no longer initialized here
        setSetupModalVisible(true);
    };

    const confirmStartEmptySession = () => {
        const type = setupForm.type.trim() || "Custom Session";
        const notes = setupForm.notes.trim() || "None";
        
        setSetupModalVisible(false);
        initializeWorkoutBackend(type, notes);
    };

    const startFromTemplate = (template) => {
        const type = template.type || "Saved Routine";
        const notes = "Started from template";
        
        initializeWorkoutBackend(type, notes);
    };

    const initializeWorkoutBackend = async (type, notes) => {
        const token = await AsyncStorage.getItem("token");
        
        // Optimistic UI Mount
        const generatedId = Date.now(); 
        setActiveWorkoutId(generatedId);
        setActiveExercises([]); 
        setElapsedSeconds(0);
        setCurrentView('ACTIVE');
        startTimer();

        liveExercisesFetched.current = true; 

        await AsyncStorage.setItem("activeWorkoutId", generatedId.toString());
        await AsyncStorage.setItem("workoutStartTime", Date.now().toString());
        await AsyncStorage.setItem("workoutDataDirty", "true");

        try {
            // ONLY passing type and notes to start the workout
            const res = await fetch(`${BASE_URL}/log_workout`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ type, notes }) 
            });

            if (res.ok) {
                const data = await res.json();
                if (data.workout_id) {
                    setActiveWorkoutId(data.workout_id);
                    await AsyncStorage.setItem("activeWorkoutId", data.workout_id.toString());
                }
            }
        } catch (error) {
            console.log("Backend offline, running locally.");
        }
    };

    const submitExercise = async () => {
        if (!exForm.name || !exForm.sets || !exForm.reps || !exForm.weight) {
            Alert.alert("Missing Fields", "Please complete all structural parameters.");
            return;
        }

        const safeDesc = exForm.desc.trim() === "" ? "None" : exForm.desc;
        const localNewEx = {
            name: exForm.name, 
            sets: parseInt(exForm.sets, 10),
            reps: parseInt(exForm.reps, 10), 
            weight: parseFloat(exForm.weight), 
            desc: safeDesc
        };
        
        setActiveExercises(prev => [...prev, localNewEx]);
        setAddModalVisible(false);
        setExForm({ name: '', sets: '', reps: '', weight: '', desc: 'None' });

        const token = await AsyncStorage.getItem("token");
        try {
            const encodedName = encodeURIComponent(exForm.name);
            const encodedDesc = encodeURIComponent(safeDesc);
            const url = `${BASE_URL}/add_excersize/${activeWorkoutId}/${encodedName}/${exForm.sets}/${exForm.reps}/${exForm.weight}/${encodedDesc}`;
            
            await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
        } catch (error) {
            console.log("Local sync only.");
        }
    };

    const finishWorkout = async () => {
        Alert.alert(
            "Complete Session", "Commit this session to history?",
            [
                { text: "Continue Training", style: "cancel" },
                { text: "Finish & Save", style: "default", onPress: async () => {
                    clearInterval(timerRef.current);
                    
                    // CALCULATING EXACT TRACKED DURATION HERE
                    const finalDurationMins = Math.max(1, Math.floor(elapsedSeconds / 60));

                    const calculatedVolume = activeExercises.reduce((acc, curr) => acc + (curr.sets * curr.reps * curr.weight), 0);
                    setSummaryData({ volume: calculatedVolume, achieved_overload: true });
                    setCurrentView('SUMMARY');

                    liveExercisesFetched.current = false;
                    await AsyncStorage.removeItem("activeWorkoutId");
                    await AsyncStorage.removeItem("workoutStartTime");
                    await AsyncStorage.setItem("workoutDataDirty", "true"); 

                    const token = await AsyncStorage.getItem("token");
                    try {
                        // SENDING DURATION IN THE FINISH PAYLOAD
                        const res = await fetch(`${BASE_URL}/finish_workout/${activeWorkoutId}`, {
                            method: 'POST', 
                            headers: { 
                                'Authorization': `Bearer ${token}`, 
                                'Content-Type': 'application/json' 
                            },
                            body: JSON.stringify({ duration: finalDurationMins })
                        });
                        
                        if (res.ok) {
                            const resultData = await res.json();
                            setSummaryData(resultData);
                        }
                    } catch (error) {
                        console.log("Server unreachable.");
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

    // ==========================================
    // RENDERERS
    // ==========================================
    
    // FlatList ListHeaderComponent for infinite scrolling Hub Layout
    const renderHubHeader = () => (
        <View style={styles.headerContainer}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Workouts</Text>
                    {backgroundSyncing && <Text style={styles.syncIndicatorText}>Updating streams...</Text>}
                </View>
                <TouchableOpacity style={styles.iconButton}>
                    <Feather name="message-circle" size={22} color="#10b981" />
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={triggerStartEmptySession}>
                <Ionicons name="add-circle-outline" size={24} color="#fff" style={styles.btnIcon} />
                <Text style={styles.primaryButtonText}>Start Empty Session</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Saved Routines</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll} contentContainerStyle={{ paddingRight: 20 }}>
                {savedTemplates.map((item, index) => (
                    <TouchableOpacity key={index} style={styles.templateCard} onPress={() => startFromTemplate(item)}>
                        <Feather name="bookmark" size={18} color="#10b981" style={{ marginBottom: 12 }} />
                        <Text style={styles.templateTitle} numberOfLines={2}>{item.type || "Template"}</Text>
                        <Text style={styles.templateMeta}>{item.duration_min || 60} mins</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <Text style={styles.sectionTitle}>Recent History</Text>
        </View>
    );

    const renderHistoryCard = ({ item }) => (
        <View style={styles.historyCard}>
            <View style={styles.historyRow}>
                <Text style={styles.historyTitle} numberOfLines={1}>{item.type || "Custom Workout"}</Text>
                <Text style={styles.historyDuration}>{item.duration_min || 0}m</Text>
            </View>
            <Text style={styles.historyDate}>
                {item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "Recently"}
            </Text>
            <TouchableOpacity style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>View Performance Matrix</Text>
            </TouchableOpacity>
        </View>
    );

    const renderHub = () => (
        <FlatList
            data={recentWorkouts}
            keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
            renderItem={renderHistoryCard}
            ListHeaderComponent={renderHubHeader}
            ListFooterComponent={
                loadingMoreHistory 
                ? <ActivityIndicator size="small" color="#10b981" style={{ marginVertical: 20 }}/> 
                : <View style={{height: 110}}/>
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.flatListContent}
            onEndReached={loadMoreHistory}
            onEndReachedThreshold={0.5}
        />
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

            <ScrollView style={styles.activeScrollContainer} contentContainerStyle={styles.activeScrollContent} showsVerticalScrollIndicator={true}>
                {activeExercises.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Feather name="activity" size={44} color="#475569" style={{marginBottom: 16}} />
                        <Text style={styles.emptyText}>No exercises added to this session layout.</Text>
                    </View>
                ) : (
                    activeExercises.map((ex, idx) => (
                        <View key={idx} style={styles.exerciseCard}>
                            <View style={styles.exerciseHeaderRow}>
                                <Text style={styles.exerciseName}>{ex.name || ex.ex_name}</Text>
                                {ex.desc && ex.desc !== 'None' && <Text style={styles.exerciseDescText}>{ex.desc}</Text>}
                            </View>
                            <View style={styles.exerciseStatsRow}>
                                <View style={styles.statBox}>
                                    <Text style={styles.statLabel}>SETS</Text>
                                    <Text style={styles.statValue}>{ex.sets}</Text>
                                </View>
                                <View style={styles.statBox}>
                                    <Text style={styles.statLabel}>REPS</Text>
                                    <Text style={styles.statValue}>{ex.reps}</Text>
                                </View>
                                <View style={styles.statBox}>
                                    <Text style={styles.statLabel}>WEIGHT</Text>
                                    <Text style={styles.statValuePrimary}>{ex.weight} kg</Text>
                                </View>
                            </View>
                        </View>
                    ))
                )}
                <TouchableOpacity style={styles.addExerciseButton} onPress={() => setAddModalVisible(true)}>
                    <Feather name="plus" size={20} color="#10b981" />
                    <Text style={styles.addExerciseText}>ADD NEW EXERCISE</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );

    const renderSummary = () => (
        <View style={styles.summaryContainer}>
            <View style={styles.summaryCard}>
                <Ionicons name="trophy" size={56} color="#10b981" style={{marginBottom: 16}} />
                <Text style={styles.summaryTitle}>Session Completed!</Text>
                <Text style={styles.summarySubtitle}>Your progression vector has been updated.</Text>

                <View style={styles.summaryStatsBox}>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Total Volume</Text>
                        <Text style={styles.summaryValue}>{summaryData?.volume || 0} kg</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Progressive Overload</Text>
                        <Text style={summaryData?.achieved_overload ? styles.summarySuccess : styles.summaryWarning}>
                            {summaryData?.achieved_overload ? "Achieved" : "Maintained"}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={() => { 
                    setCurrentView('HUB'); 
                    fetchHubDataSilently(); 
                }}>
                    <Text style={styles.primaryButtonText}>Return to Hub</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            {currentView === 'HUB' && renderHub()}
            {currentView === 'ACTIVE' && renderActiveWorkout()}
            {currentView === 'SUMMARY' && renderSummary()}

            <View style={styles.bottomNavBar}>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate("Dashboard")}>
                    <Feather name="home" size={22} color="#64748b" />
                    <Text style={styles.navLabelUnfocused}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItemActive}>
                    <Ionicons name="barbell" size={24} color="#10b981" />
                    <Text style={styles.navLabelActive}>Workouts</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate("Macros")}>
                    <Feather name="pie-chart" size={22} color="#64748b" />
                    <Text style={styles.navLabelUnfocused}>Macros</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate("Profile")}>
                    <Feather name="user" size={22} color="#64748b" />
                    <Text style={styles.navLabelUnfocused}>Profile</Text>
                </TouchableOpacity>
            </View>

            {/* Setup Modal for Empty Sessions */}
            <Modal visible={isSetupModalVisible} animationType="slide" transparent={true}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Setup Session</Text>
                            <TouchableOpacity onPress={() => setSetupModalVisible(false)} style={styles.closeModalBtn}>
                                <Feather name="x" size={24} color="#94a3b8" />
                            </TouchableOpacity>
                        </View>
                        
                        <View style={styles.inputContainer}>
                            <TextInput 
                                style={styles.input} 
                                placeholder="Workout Type (e.g. Pull Day)" 
                                placeholderTextColor="#64748b" 
                                value={setupForm.type} 
                                onChangeText={(t) => setSetupForm({...setupForm, type: t})} 
                            />
                        </View>
                        
                        <View style={styles.inputContainer}>
                            <TextInput 
                                style={styles.input} 
                                placeholder="Optional Goals / Notes" 
                                placeholderTextColor="#64748b" 
                                value={setupForm.notes} 
                                onChangeText={(t) => setSetupForm({...setupForm, notes: t})} 
                            />
                        </View>
                        
                        <TouchableOpacity style={styles.primaryButton} onPress={confirmStartEmptySession}>
                            <Text style={styles.primaryButtonText}>Initialize Workout</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Add Exercise Modal */}
            <Modal visible={isAddModalVisible} animationType="slide" transparent={true}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Log Exercise Matrix</Text>
                            <TouchableOpacity onPress={() => setAddModalVisible(false)} style={styles.closeModalBtn}>
                                <Feather name="x" size={24} color="#94a3b8" />
                            </TouchableOpacity>
                        </View>
                        
                        <View style={styles.inputContainer}>
                            <TextInput 
                                style={styles.input} 
                                placeholder="Exercise Nomenclature (e.g. Squat)" 
                                placeholderTextColor="#64748b" 
                                value={exForm.name} 
                                onChangeText={(t) => setExForm({...exForm, name: t})} 
                            />
                        </View>
                        
                        <View style={styles.rowInputs}>
                            <View style={[styles.inputContainer, {flex: 1, marginRight: 8}]}>
                                <TextInput 
                                    style={styles.input} 
                                    placeholder="Sets" 
                                    placeholderTextColor="#64748b" 
                                    keyboardType="numeric" 
                                    value={exForm.sets} 
                                    onChangeText={(t) => setExForm({...exForm, sets: t})} 
                                />
                            </View>
                            <View style={[styles.inputContainer, {flex: 1, marginRight: 8}]}>
                                <TextInput 
                                    style={styles.input} 
                                    placeholder="Reps" 
                                    placeholderTextColor="#64748b" 
                                    keyboardType="numeric" 
                                    value={exForm.reps} 
                                    onChangeText={(t) => setExForm({...exForm, reps: t})} 
                                />
                            </View>
                            <View style={[styles.inputContainer, {flex: 1}]}>
                                <TextInput 
                                    style={styles.input} 
                                    placeholder="Weight (kg)" 
                                    placeholderTextColor="#64748b" 
                                    keyboardType="numeric" 
                                    value={exForm.weight} 
                                    onChangeText={(t) => setExForm({...exForm, weight: t})} 
                                />
                            </View>
                        </View>
                        
                        <View style={styles.inputContainer}>
                            <TextInput 
                                style={styles.input} 
                                placeholder="Execution Cues / Notes" 
                                placeholderTextColor="#64748b" 
                                value={exForm.desc} 
                                onChangeText={(t) => setExForm({...exForm, desc: t})} 
                            />
                        </View>
                        
                        <TouchableOpacity style={styles.primaryButton} onPress={submitExercise}>
                            <Text style={styles.primaryButtonText}>Append to Current Stack</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
};

// ==========================================
// CENTRALIZED PERFORMANCE TYPOGRAPHY STYLES
// ==========================================
const styles = StyleSheet.create({
    safeArea: { 
        flex: 1, 
        backgroundColor: '#0f172a' 
    },
    flatListContent: { 
        paddingHorizontal: 20, 
        paddingTop: 24 
    },
    headerContainer: { 
        paddingBottom: 8 
    },
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 28 
    },
    headerTitle: { 
        fontSize: 30, 
        fontWeight: '800', 
        color: '#ffffff', 
        letterSpacing: -0.5 
    },
    syncIndicatorText: { 
        fontSize: 12, 
        color: '#10b981', 
        fontWeight: '500', 
        marginTop: 2 
    },
    iconButton: { 
        backgroundColor: 'rgba(30, 41, 59, 0.7)', 
        borderWidth: 1, 
        borderColor: '#334155', 
        padding: 12, 
        borderRadius: 14 
    },
    sectionTitle: { 
        fontSize: 18, 
        fontWeight: '700', 
        color: '#ffffff', 
        marginBottom: 16, 
        marginTop: 12, 
        letterSpacing: -0.2 
    },
    emptyText: { 
        color: '#64748b', 
        fontSize: 14, 
        textAlign: 'center' 
    },
    primaryButton: { 
        backgroundColor: '#10b981', 
        height: 54, 
        borderRadius: 16, 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginBottom: 28, 
        width: '100%', 
        elevation: 2 
    },
    primaryButtonText: { 
        color: '#ffffff', 
        fontSize: 15, 
        fontWeight: '700' 
    },
    btnIcon: { 
        marginRight: 8 
    },
    secondaryButton: { 
        backgroundColor: '#0f172a', 
        borderRadius: 12, 
        paddingVertical: 12, 
        alignItems: 'center', 
        borderWidth: 1, 
        borderColor: '#1e293b' 
    },
    secondaryButtonText: { 
        color: '#94a3b8', 
        fontWeight: '600', 
        fontSize: 13 
    },
    horizontalScroll: { 
        marginBottom: 28, 
        marginLeft: -4 
    },
    templateCard: { 
        backgroundColor: '#1e293b', 
        borderRadius: 18, 
        padding: 16, 
        marginRight: 14, 
        width: 150, 
        borderWidth: 1, 
        borderColor: '#334155', 
        justifyContent: 'space-between', 
        minHeight: 115 
    },
    templateTitle: { 
        color: '#ffffff', 
        fontWeight: '700', 
        fontSize: 14, 
        lineHeight: 18 
    },
    templateMeta: { 
        color: '#64748b', 
        fontSize: 12, 
        fontWeight: '500', 
        marginTop: 6 
    },
    historyCard: { 
        backgroundColor: '#1e293b', 
        borderRadius: 18, 
        padding: 18, 
        marginBottom: 14, 
        borderWidth: 1, 
        borderColor: '#334155' 
    },
    historyRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 4 
    },
    historyTitle: { 
        color: '#ffffff', 
        fontWeight: '700', 
        fontSize: 16, 
        flex: 1, 
        marginRight: 12 
    },
    historyDuration: { 
        color: '#10b981', 
        fontWeight: '700', 
        fontSize: 14 
    },
    historyDate: { 
        color: '#64748b', 
        fontSize: 13, 
        marginBottom: 14, 
        fontWeight: '500' 
    },
    activeContainer: { 
        flex: 1, 
        backgroundColor: '#0f172a' 
    },
    activeHeader: { 
        paddingHorizontal: 20, 
        paddingTop: 16, 
        paddingBottom: 16, 
        backgroundColor: '#1e293b', 
        borderBottomWidth: 1, 
        borderBottomColor: '#334155', 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
    },
    activeLabel: { 
        color: '#10b981', 
        fontWeight: '800', 
        fontSize: 11, 
        letterSpacing: 1.5, 
        marginBottom: 2 
    },
    timerText: { 
        fontSize: 30, 
        fontWeight: '800', 
        color: '#ffffff', 
        letterSpacing: -0.5 
    },
    finishButton: { 
        backgroundColor: '#ef4444', 
        paddingHorizontal: 18, 
        paddingVertical: 10, 
        borderRadius: 12 
    },
    finishButtonText: { 
        color: '#ffffff', 
        fontWeight: '700', 
        fontSize: 14 
    },
    activeScrollContainer: { 
        flex: 1, 
        paddingHorizontal: 20 
    },
    activeScrollContent: { 
        paddingTop: 20, 
        paddingBottom: 120 
    },
    emptyState: { 
        alignItems: 'center', 
        justifyContent: 'center', 
        paddingVertical: 60 
    },
    exerciseCard: { 
        backgroundColor: '#1e293b', 
        borderRadius: 18, 
        padding: 16, 
        marginBottom: 14, 
        borderWidth: 1, 
        borderColor: '#334155' 
    },
    exerciseHeaderRow: { 
        marginBottom: 12 
    },
    exerciseName: { 
        color: '#ffffff', 
        fontWeight: '700', 
        fontSize: 16 
    },
    exerciseDescText: { 
        color: '#64748b', 
        fontSize: 12, 
        marginTop: 2 
    },
    exerciseStatsRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        backgroundColor: '#0f172a', 
        paddingVertical: 10, 
        paddingHorizontal: 16, 
        borderRadius: 14 
    },
    statBox: { 
        alignItems: 'center' 
    },
    statLabel: { 
        color: '#475569', 
        fontSize: 10, 
        fontWeight: '700', 
        marginBottom: 2, 
        letterSpacing: 0.5 
    },
    statValue: { 
        color: '#ffffff', 
        fontWeight: '700', 
        fontSize: 16 
    },
    statValuePrimary: { 
        color: '#10b981', 
        fontWeight: '700', 
        fontSize: 16 
    },
    addExerciseButton: { 
        backgroundColor: 'rgba(16, 185, 129, 0.04)', 
        borderWidth: 1.5, 
        borderColor: '#10b981', 
        borderStyle: 'dashed', 
        borderRadius: 18, 
        padding: 16, 
        alignItems: 'center', 
        flexDirection: 'row', 
        justifyContent: 'center', 
        marginTop: 6 
    },
    addExerciseText: { 
        color: '#10b981', 
        fontWeight: '700', 
        fontSize: 14, 
        marginLeft: 6 
    },
    summaryContainer: { 
        flex: 1, 
        paddingHorizontal: 20, 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    summaryCard: { 
        backgroundColor: '#1e293b', 
        borderRadius: 24, 
        padding: 24, 
        alignItems: 'center', 
        borderWidth: 1, 
        borderColor: '#334155', 
        width: '100%' 
    },
    summaryTitle: { 
        fontSize: 24, 
        fontWeight: '800', 
        color: '#ffffff', 
        marginBottom: 4 
    },
    summarySubtitle: { 
        color: '#64748b', 
        fontSize: 14, 
        textAlign: 'center', 
        marginBottom: 24 
    },
    summaryStatsBox: { 
        width: '100%', 
        backgroundColor: '#0f172a', 
        borderRadius: 16, 
        padding: 16, 
        marginBottom: 24 
    },
    summaryRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        marginBottom: 12 
    },
    summaryLabel: { 
        color: '#64748b', 
        fontSize: 14, 
        fontWeight: '500' 
    },
    summaryValue: { 
        color: '#ffffff', 
        fontWeight: '700', 
        fontSize: 14 
    },
    summarySuccess: { 
        color: '#10b981', 
        fontWeight: '700', 
        fontSize: 14 
    },
    summaryWarning: { 
        color: '#f59e0b', 
        fontWeight: '700', 
        fontSize: 14 
    },
    bottomNavBar: { 
        height: 72, 
        backgroundColor: '#1e293b', 
        borderTopWidth: 1, 
        borderTopColor: '#334155', 
        flexDirection: 'row', 
        justifyContent: 'space-around', 
        alignItems: 'center', 
        paddingBottom: Platform.OS === 'ios' ? 14 : 0 
    },
    navItem: { 
        alignItems: 'center', 
        justifyContent: 'center', 
        flex: 1 
    },
    navItemActive: { 
        alignItems: 'center', 
        justifyContent: 'center', 
        flex: 1 
    },
    navLabelUnfocused: { 
        color: '#64748b', 
        fontSize: 11, 
        fontWeight: '500', 
        marginTop: 3 
    },
    navLabelActive: { 
        color: '#10b981', 
        fontSize: 11, 
        fontWeight: '700', 
        marginTop: 3 
    },
    modalOverlay: { 
        flex: 1, 
        justifyContent: 'flex-end', 
        backgroundColor: 'rgba(15, 23, 42, 0.75)' 
    },
    modalContent: { 
        backgroundColor: '#1e293b', 
        borderTopLeftRadius: 24, 
        borderTopRightRadius: 24, 
        paddingHorizontal: 20, 
        paddingTop: 20, 
        paddingBottom: Platform.OS === 'ios' ? 40 : 24, 
        borderTopWidth: 1, 
        borderTopColor: '#334155' 
    },
    modalHeader: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 20 
    },
    modalTitle: { 
        fontSize: 20, 
        fontWeight: '700', 
        color: '#ffffff' 
    },
    closeModalBtn: { 
        padding: 4 
    },
    inputContainer: { 
        backgroundColor: '#0f172a', 
        borderWidth: 1, 
        borderColor: '#334155', 
        borderRadius: 14, 
        paddingHorizontal: 16, 
        height: 52, 
        justifyContent: 'center', 
        marginBottom: 14 
    },
    input: { 
        flex: 1, 
        color: '#ffffff', 
        fontSize: 14, 
        fontWeight: '500' 
    },
    rowInputs: { 
        flexDirection: 'row', 
        justifyContent: 'space-between' 
    }
});

export default WorkoutsPage;