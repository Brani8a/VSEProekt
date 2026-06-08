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
    SafeAreaView,
    StatusBar,
    ActivityIndicator,
    LogBox
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client'; // The real-time engine

// Permanently disable all visible on-screen warning boxes
LogBox.ignoreAllLogs();

// Dynamic API Base URL to handle network request failures on iOS vs Android Emulators
const API_BASE_URL = Platform.OS === 'android' 
    ? 'http://10.0.2.2:5000' 
    : 'http://localhost:5000';

const SingleChatPage = ({ route, navigation }) => {
    // These params will be passed from the Inbox page when a chat is clicked
    const { roomId, targetUserId, targetUsername } = route.params || { 
        roomId: 'mock_room_1', 
        targetUserId: 'mock_friend_id', 
        targetUsername: 'Fitness Buddy' 
    };

    const targetAvatar = targetUsername ? targetUsername.substring(0, 1).toUpperCase() : '?';

    // 1. Initialize with Beautiful Mock Data
    const [messages, setMessages] = useState([
        { id: 'mock_1', text: "Hey! Are we still hitting legs today?", senderId: targetUserId, timestamp: new Date(Date.now() - 3600000).toISOString() },
        { id: 'mock_2', text: "Yeah absolutely, I just finished up my meal.", senderId: 'me', timestamp: new Date(Date.now() - 3500000).toISOString() },
        { id: 'mock_3', text: "Awesome, I'll see you at the rack in 20 mins.", senderId: targetUserId, timestamp: new Date(Date.now() - 3400000).toISOString() }
    ]);
    
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    
    const socketRef = useRef(null); 
    const flatListRef = useRef(null);

    // 2. HTTP History Fetcher & Socket.IO Real-Time Engine Setup
    useEffect(() => {
        let isMounted = true;

        const initializeChatRoom = async () => {
            try {
                const token = await AsyncStorage.getItem('access_token');
                if (!token) return;

                // --- PART A: HTTP Fetch Historical Database Messages ---
                const response = await fetch(`${API_BASE_URL}/get_chat_history/${roomId}`, {
                    method: 'GET',
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    if (data && data.length > 0 && isMounted) {
                        const formattedMessages = data.map(msg => ({
                            id: msg.id ? msg.id.toString() : Math.random().toString(),
                            text: msg.content,
                            senderId: msg.sender_id,
                            timestamp: msg.created_at,
                        }));
                        // Replace mock data with real history
                        setMessages(formattedMessages);
                    }
                }

                // --- PART B: Initialize Real-Time Socket Connection ---
                // We use 'websocket' transport to prevent long-polling issues in React Native
                socketRef.current = io(API_BASE_URL, {
                    transports: ['websocket'],
                    extraHeaders: {
                        Authorization: `Bearer ${token}`
                    }
                });
                
                // Join the specific chat room
                socketRef.current.emit('join_chat', { room_id: roomId });

                // Listen for incoming live messages
                socketRef.current.on('receive_message', (incomingMsg) => {
                    if (!isMounted) return;
                    
                    setMessages(prev => {
                        // Prevent duplicates if the backend broadcasts the message back to the sender
                        if (prev.find(m => m.id === incomingMsg.id || m.text === incomingMsg.content)) {
                            return prev;
                        }

                        const newLiveMsg = {
                            id: incomingMsg.id ? incomingMsg.id.toString() : Math.random().toString(),
                            text: incomingMsg.content,
                            senderId: incomingMsg.sender_id,
                            timestamp: incomingMsg.created_at || new Date().toISOString()
                        };

                        return [...prev, newLiveMsg];
                    });

                    // Scroll to bottom when a new live message arrives
                    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
                });

            } catch (error) {
                console.error("Failed to initialize chat room sequence:", error);
            } finally {
                if (isMounted) setLoading(false);
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
            }
        };

        initializeChatRoom();

        // Cleanup function when user leaves the screen
        return () => {
            isMounted = false;
            if (socketRef.current) {
                socketRef.current.emit('leave_chat', { room_id: roomId });
                socketRef.current.disconnect();
            }
        };
    }, [roomId]);

    // 3. Real-Time Send Logic
    const sendMessage = async () => {
        const text = inputText.trim();
        if (!text) return;

        // Optimistic UI update: Instantly show message on the user's screen
        const tempMsg = {
            id: 'temp_' + Date.now(),
            text: text,
            senderId: 'me', // Fails the targetUser check, so it aligns perfectly to the right!
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, tempMsg]);
        setInputText('');
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

        // Fire the actual message into the live socket
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('send_message', {
                room_id: roomId,
                content: text
            });
        } else {
            console.warn("Socket disconnected. Attempting to deliver via HTTP fallback...");
            try {
                const token = await AsyncStorage.getItem('access_token');
                await fetch(`${API_BASE_URL}/send_message`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        room_id: roomId,
                        content: text
                    })
                });
            } catch (fallbackError) {
                console.error("Fallback delivery failed:", fallbackError);
            }
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        } catch (e) {
            return '';
        }
    };

    const renderMessage = ({ item }) => {
        // Smart Check: If the sender ID matches the friend we are talking to, it goes on the left.
        // Otherwise, it was sent by us, so it goes on the right.
        const isTargetUser = String(item.senderId) === String(targetUserId);

        return (
            <View style={[styles.messageRow, isTargetUser ? styles.friendRow : styles.myRow]}>
                {isTargetUser && (
                    <View style={styles.friendAvatarMini}>
                        <Text style={styles.friendAvatarMiniText}>{targetAvatar}</Text>
                    </View>
                )}
                <View style={[styles.bubble, isTargetUser ? styles.friendBubble : styles.myBubble]}>
                    <Text style={styles.messageText}>{item.text}</Text>
                    <Text style={styles.timestampText}>{formatTime(item.timestamp)}</Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeContainer}>
            <StatusBar barStyle="light-content" />

            {/* Header Area */}
            <View style={styles.header}>
                <TouchableOpacity 
                    style={styles.backButton} 
                    onPress={() => navigation.goBack()}
                >
                    <Icon name="chevron-left" size={24} color="#ffffff" />
                </TouchableOpacity>

                <View style={styles.headerUserInfo}>
                    <View style={styles.headerAvatar}>
                        <Text style={styles.headerAvatarText}>{targetAvatar}</Text>
                    </View>
                    <View>
                        <Text style={styles.headerUsername}>{targetUsername}</Text>
                        <Text style={styles.headerActiveStatus}>Active Now</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.headerActionIcon}>
                    <Icon name="more-vertical" size={20} color="#94a3b8" />
                </TouchableOpacity>
            </View>

            {/* Chat Messages List Engine */}
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
                style={styles.keyboardContainer}
            >
                {loading && messages.length === 0 ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#10b981" />
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <View style={styles.emptyAvatarLarge}>
                                    <Text style={styles.emptyAvatarText}>{targetAvatar}</Text>
                                </View>
                                <Text style={styles.emptyTitle}>Say hi to {targetUsername}!</Text>
                                <Text style={styles.emptySubtitle}>When you send a message, it will appear here.</Text>
                            </View>
                        }
                    />
                )}

                {/* Input Field Layout */}
                <View style={styles.inputContainerRow}>
                    <TouchableOpacity style={styles.attachButton}>
                        <Icon name="paperclip" size={20} color="#64748b" />
                    </TouchableOpacity>
                    
                    <View style={styles.textInputWrapper}>
                        <TextInput
                            style={styles.input}
                            placeholder="Message..."
                            placeholderTextColor="#64748b"
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            maxLength={1000}
                            autoCorrect={false}
                            spellCheck={false}
                            autoComplete="off"
                            textContentType="none"
                            selectionColor="#10b981"
                        />
                    </View>
                    
                    {inputText.trim().length > 0 ? (
                        <TouchableOpacity 
                            style={styles.sendButtonActive} 
                            onPress={sendMessage}
                            activeOpacity={0.8}
                        >
                            <Icon name="send" size={18} color="#ffffff" />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.sendButtonDisabled}>
                            <Icon name="mic" size={18} color="#64748b" />
                        </View>
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default SingleChatPage;

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
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 12 : 24,
        paddingBottom: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderBottomWidth: 1,
        borderColor: '#1e293b',
    },
    backButton: {
        padding: 8,
        marginRight: 8,
    },
    headerUserInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderWidth: 1,
        borderColor: '#334155',
    },
    headerAvatarText: {
        color: '#10b981',
        fontWeight: '700',
        fontSize: 16,
    },
    headerUsername: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
    },
    headerActiveStatus: {
        fontSize: 12,
        color: '#10b981',
        fontWeight: '500',
        marginTop: 2,
    },
    headerActionIcon: {
        padding: 8,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 20,
    },
    messageRow: {
        flexDirection: 'row',
        marginVertical: 6,
        maxWidth: '80%',
    },
    friendRow: {
        alignSelf: 'flex-start',
    },
    myRow: {
        alignSelf: 'flex-end',
    },
    friendAvatarMini: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        alignSelf: 'flex-end',
        borderWidth: 1,
        borderColor: '#334155',
    },
    friendAvatarMiniText: {
        color: '#10b981',
        fontSize: 12,
        fontWeight: '700',
    },
    bubble: {
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    myBubble: {
        backgroundColor: '#10b981',
        borderBottomRightRadius: 4,
    },
    friendBubble: {
        backgroundColor: '#1e293b',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: '#334155',
    },
    messageText: {
        fontSize: 15,
        color: '#ffffff',
        lineHeight: 22,
    },
    timestampText: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.6)',
        alignSelf: 'flex-end',
        marginTop: 4,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
    },
    emptyAvatarLarge: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyAvatarText: {
        fontSize: 32,
        fontWeight: '800',
        color: '#10b981',
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#94a3b8',
    },
    inputContainerRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderColor: '#1e293b',
        backgroundColor: '#0f172a',
    },
    attachButton: {
        padding: 12,
        marginBottom: 2,
    },
    textInputWrapper: {
        flex: 1,
        backgroundColor: '#1e293b',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 12 : 8,
        paddingBottom: Platform.OS === 'ios' ? 12 : 8,
        marginHorizontal: 8,
        minHeight: 44,
        maxHeight: 120,
        justifyContent: 'center',
    },
    input: {
        color: '#ffffff',
        fontSize: 15,
        maxHeight: 100,
    },
    sendButtonActive: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 2,
    },
    sendButtonDisabled: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 2,
    }
});