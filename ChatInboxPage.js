import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
    TextInput,
    Platform,
    ActivityIndicator,
    LogBox
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

// Permanently disable all visible on-screen warning boxes
LogBox.ignoreAllLogs();

// Dynamic API Base URL to handle network request failures on iOS vs Android Emulators
const API_BASE_URL = Platform.OS === 'android' 
    ? 'http://10.0.2.2:5000' 
    : 'http://localhost:5000';

// High-fidelity timestamp formatting logic (Today -> Time, Yesterday -> 'Yesterday', Older -> 'Month Day')
const formatLastMessageTime = (isoString) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString; // Handle if raw string mock data is passed

        const now = new Date();
        const todayStr = now.toDateString();
        const msgDateStr = date.toDateString();

        if (msgDateStr === todayStr) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        }

        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        
        if (msgDateStr === yesterday.toDateString()) {
            return 'Yesterday';
        }

        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (e) {
        return '';
    }
};

const ChatInboxPage = ({ navigation }) => {
    const navigationHook = useNavigation();
    const activeNavigation = navigation || navigationHook;

    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Initialized with structured mock threads so the UI renders fully instantly
    const [chatThreads, setChatThreads] = useState([
        { 
            id: 'mock_1', 
            friendId: 'mock_user_a',
            username: 'alex_lifts', 
            lastMessage: 'Bro, what time are we hitting chest today?', 
            timestamp: '14:20', 
            unread: 2,
            avatar: 'A'
        },
        { 
            id: 'mock_2', 
            friendId: 'mock_user_b',
            username: 'sarah.fitness', 
            lastMessage: 'Thanks for sending over that meal plan!', 
            timestamp: 'Yesterday', 
            unread: 0,
            avatar: 'S'
        },
        { 
            id: 'mock_3', 
            friendId: 'mock_user_c',
            username: 'coach_mike', 
            lastMessage: 'Make sure you foam roll those hamstrings.', 
            timestamp: 'Oct 12', 
            unread: 1,
            avatar: 'C'
        }
    ]);

    // Live endpoint integration running safely in the background
    useEffect(() => {
        const fetchLiveInbox = async () => {
            setLoading(true);
            try {
                const token = await AsyncStorage.getItem('access_token');
                if (!token) return;

                const response = await fetch(`${API_BASE_URL}/get_inbox`, {
                    method: 'GET',
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    if (data && Array.isArray(data)) {
                        // Safe map function verifying backend values with explicit fallbacks
                        const formattedLiveChats = data.map(item => ({
                            id: item.room_id ? item.room_id.toString() : Math.random().toString(),
                            friendId: item.friend_id || null,
                            username: item.friend_name || 'Anonymous User',
                            lastMessage: item.last_message || 'New chat started. Say hi!',
                            timestamp: formatLastMessageTime(item.last_timestamp),
                            unread: item.unread_count || 0,
                            avatar: item.friend_name ? item.friend_name.substring(0, 1).toUpperCase() : '?'
                        }));

                        // Merges live threads over mock data seamlessly, preserving existing mock fields
                        setChatThreads(prevThreads => {
                            const liveUsernames = new Set(formattedLiveChats.map(c => c.username.toLowerCase()));
                            const liveIds = new Set(formattedLiveChats.map(c => c.id));
                            const uniqueMock = prevThreads.filter(t => t.id.startsWith('mock_') && !liveIds.has(t.id) && !liveUsernames.has(t.username.toLowerCase()));
                            return [...formattedLiveChats, ...uniqueMock];
                        });
                    }
                }
            } catch (error) {
                console.error("Live fetch request error caught safely:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchLiveInbox();
    }, []);

    // Crash-proof filtering logic verifying valid text references before execution
    const filteredThreads = chatThreads.filter(thread => {
        const username = thread && thread.username ? thread.username.toLowerCase() : '';
        const lastMessage = thread && thread.lastMessage ? thread.lastMessage.toLowerCase() : '';
        const query = searchQuery ? searchQuery.toLowerCase() : '';
        
        return username.includes(query) || lastMessage.includes(query);
    });

    // Action execution when any interactive card component is pressed
    const openChat = (user) => {
        if (activeNavigation) {
            activeNavigation.navigate('SingleChatPage', { 
                roomId: user.id, 
                targetUserId: user.friendId,
                targetUsername: user.username 
            });
        } else {
            console.log(`Action triggered: Open Room ${user.id} with ${user.username}`);
        }
    };

    const renderChatRow = ({ item }) => {
        const hasUnread = item.unread > 0;

        return (
            <TouchableOpacity 
                style={[styles.chatRow, hasUnread && styles.chatRowUnreadActive]} 
                onPress={() => openChat(item)}
                activeOpacity={0.6}
            >
                {/* Profile Image Node Placeholder */}
                <View style={styles.avatarContainer}>
                    <Text style={styles.avatarText}>{item.avatar}</Text>
                    {hasUnread && <View style={styles.onlineBadge} />}
                </View>

                {/* Text Context Node */}
                <View style={styles.messageContent}>
                    <Text style={[styles.usernameText, hasUnread && styles.usernameUnread]}>
                        {item.username}
                    </Text>
                    <Text 
                        style={[styles.lastMessageText, hasUnread && styles.lastMessageUnread]} 
                        numberOfLines={1}
                    >
                        {item.lastMessage}
                    </Text>
                </View>

                {/* Metrics Meta Node */}
                <View style={styles.metaContainer}>
                    <Text style={[styles.timestampText, hasUnread && styles.timestampUnread]}>
                        {item.timestamp}
                    </Text>
                    {hasUnread && (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>{item.unread}</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.safeContainer}>
            <StatusBar barStyle="light-content" />
            
            {/* Navigation Header View */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.headerTitle}>Messages</Text>
                </View>
                <TouchableOpacity style={styles.newChatAction} activeOpacity={0.7}>
                    <Icon name="edit" size={20} color="#10b981" />
                </TouchableOpacity>
            </View>

            {/* Live Thread Query Search Input Layout */}
            <View style={styles.searchContainer}>
                <View style={styles.searchWrapper}>
                    <Icon name="search" size={18} color="#64748b" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search messages..."
                        placeholderTextColor="#64748b"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCorrect={false}
                        spellCheck={false}
                        autoComplete="off"
                        textContentType="none"
                        autoCapitalize="none"
                        selectionColor="#10b981"
                    />
                </View>
            </View>

            {/* List Layout View Rendering Engine */}
            {loading && chatThreads.length === 0 ? (
                <View style={styles.centerLoading}>
                    <ActivityIndicator size="large" color="#10b981" />
                </View>
            ) : (
                <FlatList
                    data={filteredThreads}
                    keyExtractor={(item) => item.id}
                    renderItem={renderChatRow}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Icon name="message-square" size={48} color="#334155" />
                            <Text style={styles.emptyText}>No messages found.</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
};

export default ChatInboxPage;

const styles = StyleSheet.create({
    safeContainer: {
        flex: 1,
        backgroundColor: '#0f172a', 
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 18 : 34,
        paddingBottom: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#ffffff',
        letterSpacing: 0.5,
    },
    newChatAction: {
        padding: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderBottomWidth: 1,
        borderColor: '#1e293b',
    },
    searchWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: '#ffffff',
        fontSize: 15,
        height: '100%',
    },
    listContent: {
        paddingTop: 8,
        paddingBottom: 40,
    },
    chatRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(30, 41, 59, 0.5)', 
        backgroundColor: '#0f172a',
    },
    chatRowUnreadActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.03)', 
    },
    avatarContainer: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
        borderWidth: 1.5,
        borderColor: '#334155',
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#10b981',
    },
    onlineBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#10b981',
        borderWidth: 2,
        borderColor: '#0f172a',
    },
    messageContent: {
        flex: 1,
        justifyContent: 'center',
    },
    usernameText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#e2e8f0',
        marginBottom: 4,
    },
    usernameUnread: {
        color: '#ffffff',
        fontWeight: '700',
    },
    lastMessageText: {
        fontSize: 14,
        color: '#94a3b8',
        paddingRight: 10, 
    },
    lastMessageUnread: {
        color: '#f8fafc',
        fontWeight: '500',
    },
    metaContainer: {
        alignItems: 'flex-end',
        justifyContent: 'center',
        minWidth: 50,
    },
    timestampText: {
        fontSize: 12,
        color: '#64748b',
        marginBottom: 6,
    },
    timestampUnread: {
        color: '#10b981',
        fontWeight: '600',
    },
    unreadBadge: {
        backgroundColor: '#10b981',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 12,
        minWidth: 22,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 3,
    },
    unreadBadgeText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: '800',
    },
    centerLoading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 40,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
    },
    emptyText: {
        color: '#64748b',
        fontSize: 15,
        marginTop: 12,
    }
});