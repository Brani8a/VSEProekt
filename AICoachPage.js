import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    SafeAreaView,
    StatusBar,
    LogBox
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Feather';

// Permanently disable all visible on-screen warning boxes
LogBox.ignoreAllLogs();

const AICoachPage = () => {
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const flatListRef = useRef(null);

    const suggestions = [
        { id: '1', icon: 'activity', text: 'Analyze my current workout split' },
        { id: '2', icon: 'coffee', text: 'Give me a 2500kcal high-protein meal plan' },
        { id: '3', icon: 'zap', text: 'How do I fix form issues on heavy squats?' },
    ];

    const createWelcomeMessage = () => ({
        id: 'welcome_' + Date.now(),
        text: "Hey there! 👋 I'm your AI Coach. I have complete access to your workout logs and metrics. Ask me anything about optimizing your training split, nutritional strategy, or fixing your progression!",
        sender: 'ai',
        timestamp: new Date().toISOString()
    });

    useEffect(() => {
        const loadChatHistory = async () => {
            try {
                const savedChat = await AsyncStorage.getItem('ai_coach_chat_history');
                if (savedChat !== null) {
                    setMessages(JSON.parse(savedChat));
                } else {
                    setMessages([createWelcomeMessage()]);
                }
                
                setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                }, 150);
            } catch (error) {
                console.error("Failed to load cache:", error);
                setMessages([createWelcomeMessage()]);
            }
        };
        loadChatHistory();
    }, []);

    useEffect(() => {
        const saveChatHistory = async () => {
            try {
                if (messages.length > 0) {
                    await AsyncStorage.setItem('ai_coach_chat_history', JSON.stringify(messages));
                }
            } catch (error) {
                console.error("Failed to save cache:", error);
            }
        };
        saveChatHistory();
    }, [messages]);

    const startNewChatSession = () => {
        const freshWelcomeMessage = createWelcomeMessage();
        setMessages([freshWelcomeMessage]);
        setInputText('');
        setLoading(false);

        AsyncStorage.removeItem('ai_coach_chat_history').catch(err => {
            console.error("Background clear error:", err);
        });
    };

    const sendMessage = async (textToSend) => {
        const text = textToSend || inputText.trim();
        if (!text) return;

        if (!textToSend) setInputText('');

        const userMessage = {
            id: String(Date.now()),
            text: text,
            sender: 'user',
            timestamp: new Date().toISOString()
        };
        
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setLoading(true);

        setTimeout(() => { flatListRef.current?.scrollToEnd({ animated: true }); }, 60);

        try {
            const token = await AsyncStorage.getItem('access_token');

            // --- REFACTORED HISTORY FORMATTING BLOCK ---
            const chatHistory = messages
                .filter(msg => !msg.id.toString().startsWith('welcome')) 
                .slice(-10) 
                .map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    content: msg.text
                }));

            const response = await fetch(`http://10.0.2.2:5000/ask_coach`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token || ''}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    question: text,
                    history: chatHistory
                })
            });

            const data = await response.json();

            let aiResponseText = "";
            if (response.ok) {
                aiResponseText = data.coach_response || (typeof data === 'string' ? data : JSON.stringify(data));
            } else {
                aiResponseText = data.error || "Something went wrong. Let's try that query again.";
            }
            // --- END OF REFACTORED BLOCK ---

            setMessages(prev => {
                const updated = [...prev, {
                    id: String(Date.now() + 1),
                    text: aiResponseText,
                    sender: 'ai',
                    timestamp: new Date().toISOString()
                }];
                setTimeout(() => { flatListRef.current?.scrollToEnd({ animated: true }); }, 60);
                return updated;
            });

        } catch (error) {
            console.error("AI Coach Fetch Error:", error);
            setMessages(prev => [...prev, {
                id: String(Date.now() + 1),
                text: "⚠️ I'm having trouble reaching the server room right now. Make sure your backend app server is running.",
                sender: 'ai',
                timestamp: new Date().toISOString()
            }]);
        } finally {
            setLoading(false);
        }
    };

    const renderMessageItem = ({ item }) => {
        const isUser = item.sender === 'user';
        let timeString = "";
        try {
            const msgTime = new Date(item.timestamp);
            if (!isNaN(msgTime.getTime())) {
                timeString = msgTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        } catch(e) {
            timeString = "";
        }

        return (
            <View style={[styles.messageRow, isUser ? styles.userRow : styles.aiRow]}>
                {!isUser && (
                    <View style={styles.aiAvatarMini}>
                        <Icon name="cpu" size={14} color="#10b981" />
                    </View>
                )}
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
                    <Text style={styles.messageText}>{item.text}</Text>
                    <Text style={styles.timestampText}>{timeString}</Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeContainer}>
            <StatusBar barStyle="light-content" />
            
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={styles.avatarContainer}>
                        <Icon name="cpu" size={24} color="#10b981" />
                        <View style={styles.onlineStatusIndicator} />
                    </View>
                    <View style={styles.headerTitleContainer}>
                        <Text style={styles.headerTitle}>AI Coach</Text>
                        <Text style={styles.headerSubtitle}>Personal Fitness Model v2.0</Text>
                    </View>
                </View>
                
                <TouchableOpacity 
                    style={styles.infoButton} 
                    onPress={startNewChatSession} 
                    activeOpacity={0.6}
                >
                    <Icon name="plus" size={20} color="#10b981" />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
                style={styles.keyboardContainer}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessageItem}
                    contentContainerStyle={styles.listContent}
                    ListFooterComponent={
                        loading ? (
                            <View style={styles.loadingRow}>
                                <View style={styles.aiAvatarMini}>
                                    <Icon name="cpu" size={14} color="#10b981" />
                                </View>
                                <View style={[styles.bubble, styles.aiBubble, styles.loadingBubble]}>
                                    <ActivityIndicator size="small" color="#10b981" />
                                    <Text style={styles.loadingText}>Analyzing logs...</Text>
                                </View>
                            </View>
                        ) : messages.length === 1 ? (
                            <View style={styles.suggestionsContainer}>
                                <Text style={styles.suggestionsTitle}>Suggested Inquiries</Text>
                                {suggestions.map((item) => (
                                    <TouchableOpacity 
                                        key={item.id} 
                                        style={styles.suggestionCard}
                                        onPress={() => sendMessage(item.text)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={styles.suggestionIconWrapper}>
                                            <Icon name={item.icon} size={16} color="#10b981" />
                                        </View>
                                        <Text style={styles.suggestionCardText}>{item.text}</Text>
                                        <Icon name="chevron-right" size={16} color="#475569" />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : null
                    }
                />

                <View style={styles.inputContainerRow}>
                    <View style={styles.textInputWrapper}>
                        <Icon name="message-square" size={18} color="#475569" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Ask about volume progression, metrics..."
                            placeholderTextColor="#64748b"
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            maxLength={500}
                            autoCorrect={false}
                            spellCheck={false}
                            autoComplete="off"
                            textContentType="none"
                            selectionColor="#10b981"
                        />
                    </View>
                    <TouchableOpacity 
                        style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]} 
                        onPress={() => sendMessage()}
                        disabled={!inputText.trim() && !loading}
                        activeOpacity={0.8}
                    >
                        <Icon name="send" size={18} color="#ffffff" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default AICoachPage;

const styles = StyleSheet.create({
    safeContainer: {
        flex: 1,
        backgroundColor: '#0f172a', 
    },
    keyboardContainer: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 18 : 34,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderColor: '#1e293b',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    onlineStatusIndicator: {
        position: 'absolute',
        bottom: -1,
        right: -1,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#10b981',
        borderWidth: 2,
        borderColor: '#0f172a',
    },
    headerTitleContainer: {
        marginLeft: 12,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#10b981',
        fontWeight: '500',
        marginTop: 1,
    },
    infoButton: {
        padding: 10,
        borderRadius: 10,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingVertical: 20,
    },
    messageRow: {
        flexDirection: 'row',
        marginVertical: 8,
        maxWidth: '85%',
    },
    userRow: {
        alignSelf: 'flex-end',
    },
    aiRow: {
        alignSelf: 'flex-start',
    },
    aiAvatarMini: {
        width: 26,
        height: 26,
        borderRadius: 8,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        alignSelf: 'flex-end',
        borderWidth: 0.5,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    bubble: {
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    userBubble: {
        backgroundColor: '#059669', 
        borderBottomRightRadius: 4,
    },
    aiBubble: {
        backgroundColor: '#1e293b', 
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 15,
        color: '#ffffff',
        lineHeight: 22,
    },
    timestampText: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.5)',
        alignSelf: 'flex-end',
        marginTop: 4,
    },
    loadingRow: {
        flexDirection: 'row',
        alignSelf: 'flex-start',
        marginVertical: 8,
    },
    loadingBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
    },
    loadingText: {
        color: '#94a3b8',
        fontSize: 14,
        marginLeft: 8,
    },
    suggestionsContainer: {
        marginTop: 24,
        paddingHorizontal: 4,
    },
    suggestionsTitle: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
    },
    suggestionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        padding: 14,
        borderRadius: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#334155',
    },
    suggestionIconWrapper: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    suggestionCardText: {
        flex: 1,
        color: '#e2e8f0',
        fontSize: 14,
        fontWeight: '500',
    },
    inputContainerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderColor: '#1e293b',
        backgroundColor: '#0f172a',
    },
    textInputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderWidth: 1,
        borderColor: '#1e293b',
        borderRadius: 24,
        paddingHorizontal: 14,
        marginRight: 10,
        minHeight: 48,
        maxHeight: 100,
    },
    inputIcon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        color: '#ffffff',
        fontSize: 15,
        paddingVertical: 8,
    },
    sendButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#334155',
    }
});