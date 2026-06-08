import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, TextInput } from 'react-native';
import { useNavigation } from "@react-navigation/native";
import Feather from 'react-native-vector-icons/Feather';
import Ionicons from 'react-native-vector-icons/Ionicons';

const MacrosPage = () => {
    const navigation = useNavigation();
    
    // Hardcoded for UI visualization, you'll fetch this from your backend
    const [calories, setCalories] = useState({ consumed: 1850, goal: 2500 });
    const [macros, setMacros] = useState({
        protein: { current: 120, goal: 160 },
        carbs: { current: 200, goal: 300 },
        fats: { current: 55, goal: 70 }
    });

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <View className="px-6 pt-8 pb-4 flex-row justify-between items-center">
                <Text className="text-3xl font-bold text-gray-800 tracking-tight">Nutrition</Text>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                
                {/* Calories Card */}
                <View className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 items-center mb-6">
                    <Text className="text-gray-500 font-medium mb-2">Calories Remaining</Text>
                    <Text className="text-4xl font-bold text-[#007AFF]">{calories.goal - calories.consumed}</Text>
                    <Text className="text-gray-400 mt-1">out of {calories.goal} kcal</Text>
                </View>

                {/* Macros List */}
                <Text className="text-xl font-bold text-gray-800 mb-4 tracking-tight">Daily Macros</Text>
                
                {Object.entries(macros).map(([key, data]) => (
                    <View key={key} className="bg-white p-5 rounded-3xl mb-3 shadow-sm border border-gray-100">
                        <View className="flex-row justify-between mb-2">
                            <Text className="text-lg font-bold text-gray-800 capitalize">{key}</Text>
                            <Text className="text-gray-500 font-medium">{data.current} / {data.goal}g</Text>
                        </View>
                        {/* Progress Bar */}
                        <View className="h-2 bg-gray-100 rounded-full w-full overflow-hidden">
                            <View 
                                className="h-full bg-[#007AFF] rounded-full" 
                                style={{ width: `${(data.current / data.goal) * 100}%` }} 
                            />
                        </View>
                    </View>
                ))}

            </ScrollView>

            {/* Custom Floating Nav Bar (Active on Macros) */}
            <View className="absolute bottom-6 left-6 right-6 bg-white rounded-full py-4 px-6 flex-row justify-between items-center shadow-lg border border-gray-100">
                <TouchableOpacity className="items-center opacity-50" onPress={() => navigation.navigate("Dashboard")}>
                    <Feather name="home" size={24} color="#4B5563" />
                </TouchableOpacity>
                <TouchableOpacity className="items-center opacity-50" onPress={() => navigation.navigate("Workouts")}>
                    <Ionicons name="barbell-outline" size={26} color="#4B5563" />
                </TouchableOpacity>
                <TouchableOpacity className="items-center" onPress={() => navigation.navigate("Macros")}>
                    <Feather name="pie-chart" size={24} color="#007AFF" />
                    <View className="w-1.5 h-1.5 bg-[#007AFF] rounded-full mt-1" />
                </TouchableOpacity>
                <TouchableOpacity className="items-center opacity-50" onPress={() => navigation.navigate("ChatList")}>
                    <Feather name="users" size={24} color="#4B5563" />
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default MacrosPage;