import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from "@react-navigation/native";
import Feather from 'react-native-vector-icons/Feather';
import Ionicons from 'react-native-vector-icons/Ionicons';

const DashboardPage = () => {
    const navigation = useNavigation();
    
    const [userData, setUserData] = useState(null);
    const [maxLifts, setMaxLifts] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const token = await AsyncStorage.getItem("token");
            if (!token) {
                navigation.replace("Login");
                return;
            }

            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };

            // Fetch User Details & Max Lifts simultaneously 
            const [userResponse, liftsResponse] = await Promise.all([
                fetch('http://10.0.2.2:5000/get_user_details', { headers }),
                fetch('http://10.0.2.2:5000/get_max_lifts', { headers })
            ]);

            if (userResponse.ok && liftsResponse.ok) {
                const userJson = await userResponse.json();
                const liftsJson = await liftsResponse.json();
                
                setUserData(userJson);
                setMaxLifts(liftsJson);
            } else if (userResponse.status === 401 || userResponse.status === 403) {
                // Token might be expired, redirect to login or handle refresh token here
                Alert.alert("Session Expired", "Please log in again.");
                navigation.replace("Login");
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Connection Error", "Could not connect to the server.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView className="flex-1 bg-gray-50 justify-center items-center">
                <ActivityIndicator size="large" color="#007AFF" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            {/* MAIN CONTENT AREA */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                
                {/* Header Greeting */}
                <View className="px-6 pt-8 pb-4">
                    <Text className="text-gray-500 text-lg font-medium">Good Morning,</Text>
                    <Text className="text-4xl font-bold text-gray-800 tracking-tight">
                        {userData?.name || "Athlete"}
                    </Text>
                </View>

                {/* Primary Status Card (Clean Wellness Style) */}
                <View className="px-6 mb-6">
                    <View className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 flex-row justify-between items-center">
                        <View>
                            <Text className="text-gray-500 font-medium mb-1">Current Goal</Text>
                            <Text className="text-xl font-bold text-[#007AFF] capitalize">
                                {userData?.goal ? userData.goal.replace('_', ' ') : "Not Set"}
                            </Text>
                        </View>
                        <View className="h-12 w-[1px] bg-gray-100" />
                        <View>
                            <Text className="text-gray-500 font-medium mb-1">Weight</Text>
                            <Text className="text-xl font-bold text-gray-800">
                                {userData?.weight ? `${userData.weight} kg` : "--"}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Quick Actions (Pill Buttons) */}
                <View className="px-6 flex-row justify-between mb-8">
                    <TouchableOpacity 
                        className="bg-[#007AFF] flex-1 mr-2 py-4 rounded-full flex-row justify-center items-center shadow-sm"
                        onPress={() => navigation.navigate("WorkoutInit")} // You will need to create this page
                    >
                        <Feather name="play" size={20} color="white" />
                        <Text className="text-white font-bold ml-2 text-base">Start Workout</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        className="bg-white border border-gray-200 flex-1 ml-2 py-4 rounded-full flex-row justify-center items-center shadow-sm"
                        onPress={() => navigation.navigate("AICoach")} // Route to your Ask Coach screen
                    >
                        <Feather name="message-circle" size={20} color="#007AFF" />
                        <Text className="text-[#007AFF] font-bold ml-2 text-base">Ask Coach</Text>
                    </TouchableOpacity>
                </View>

                {/* Top Lifts Section */}
                <View className="px-6">
                    <Text className="text-xl font-bold text-gray-800 mb-4 tracking-tight">Personal Records</Text>
                    
                    {Object.keys(maxLifts).length > 0 ? (
                        Object.entries(maxLifts).map(([exercise, weight], index) => (
                            <View key={index} className="bg-white p-5 rounded-3xl mb-3 shadow-sm border border-gray-100 flex-row justify-between items-center">
                                <View className="flex-row items-center">
                                    <View className="bg-blue-50 p-3 rounded-full mr-4">
                                        <Ionicons name="barbell-outline" size={24} color="#007AFF" />
                                    </View>
                                    <Text className="text-lg font-bold text-gray-800 capitalize">{exercise}</Text>
                                </View>
                                <Text className="text-xl font-bold text-[#007AFF]">{weight} kg</Text>
                            </View>
                        ))
                    ) : (
                        <View className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 items-center justify-center">
                            <Text className="text-gray-500 text-center">No personal records logged yet. Start lifting to see your stats here!</Text>
                        </View>
                    )}
                </View>

            </ScrollView>

            {/* BOTTOM NAVIGATION BAR (Floating pill style) */}
            <View className="absolute bottom-6 left-6 right-6 bg-white rounded-full py-4 px-6 flex-row justify-between items-center shadow-lg border border-gray-100">
                <TouchableOpacity className="items-center" onPress={() => navigation.navigate("Dashboard")}>
                    <Feather name="home" size={24} color="#007AFF" />
                    {/* Active dot indicator */}
                    <View className="w-1.5 h-1.5 bg-[#007AFF] rounded-full mt-1" />
                </TouchableOpacity>

                <TouchableOpacity className="items-center opacity-50" onPress={() => navigation.navigate("Workouts")}>
                    <Ionicons name="barbell-outline" size={26} color="#4B5563" />
                </TouchableOpacity>

                <TouchableOpacity className="items-center opacity-50" onPress={() => navigation.navigate("Macros")}>
                    <Feather name="pie-chart" size={24} color="#4B5563" />
                </TouchableOpacity>

                <TouchableOpacity className="items-center opacity-50" onPress={() => navigation.navigate("ChatList")}>
                    <Feather name="users" size={24} color="#4B5563" />
                </TouchableOpacity>

                <TouchableOpacity className="items-center opacity-50" onPress={() => navigation.navigate("Profile")}>
                    <Feather name="user" size={24} color="#4B5563" />
                </TouchableOpacity>
            </View>

        </SafeAreaView>
    );
};

export default DashboardPage;