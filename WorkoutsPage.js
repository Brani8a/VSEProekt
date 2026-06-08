import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useNavigation } from "@react-navigation/native";
import Feather from 'react-native-vector-icons/Feather';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WorkoutsPage = () => {
    const navigation = useNavigation();
    const [workouts, setWorkouts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Mock fetch - replace with your actual backend endpoint for fetching recent workouts
        setTimeout(() => {
            setWorkouts([
                { id: 1, type: 'Upper Body Power', duration: 45, date: 'Today' },
                { id: 2, type: 'Leg Day', duration: 60, date: 'Yesterday' },
                { id: 3, type: 'Cardio & Core', duration: 30, date: '3 days ago' }
            ]);
            setLoading(false);
        }, 1000);
    }, []);

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <View className="px-6 pt-8 pb-4 flex-row justify-between items-center">
                <Text className="text-3xl font-bold text-gray-800 tracking-tight">Workouts</Text>
                <TouchableOpacity className="bg-blue-50 p-3 rounded-full">
                    <Feather name="plus" size={24} color="#007AFF" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 50 }} />
                ) : (
                    workouts.map((workout) => (
                        <TouchableOpacity key={workout.id} className="bg-white p-5 rounded-3xl mb-4 shadow-sm border border-gray-100 flex-row items-center">
                            <View className="bg-blue-50 p-4 rounded-full mr-4">
                                <Ionicons name="barbell" size={24} color="#007AFF" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-lg font-bold text-gray-800">{workout.type}</Text>
                                <Text className="text-gray-500 font-medium">{workout.duration} mins • {workout.date}</Text>
                            </View>
                            <Feather name="chevron-right" size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            {/* Custom Floating Nav Bar (Active on Workouts) */}
            <View className="absolute bottom-6 left-6 right-6 bg-white rounded-full py-4 px-6 flex-row justify-between items-center shadow-lg border border-gray-100">
                <TouchableOpacity className="items-center opacity-50" onPress={() => navigation.navigate("Dashboard")}>
                    <Feather name="home" size={24} color="#4B5563" />
                </TouchableOpacity>
                <TouchableOpacity className="items-center" onPress={() => navigation.navigate("Workouts")}>
                    <Ionicons name="barbell" size={26} color="#007AFF" />
                    <View className="w-1.5 h-1.5 bg-[#007AFF] rounded-full mt-1" />
                </TouchableOpacity>
                <TouchableOpacity className="items-center opacity-50" onPress={() => navigation.navigate("Macros")}>
                    <Feather name="pie-chart" size={24} color="#4B5563" />
                </TouchableOpacity>
                <TouchableOpacity className="items-center opacity-50" onPress={() => navigation.navigate("ChatList")}>
                    <Feather name="users" size={24} color="#4B5563" />
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default WorkoutsPage;