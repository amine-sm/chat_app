
let currentChatUserId = null;
let socket;
let typingTimeout;
let lastDisplayedDate = null;
const onlineUsers = new Set();
let isTyping = false;
let lastTypingTime = 0;
const unreadMessages = {};
let currentChatUserOnlineStatus = false;

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-notification';
  errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
  document.body.appendChild(errorDiv);
  
  setTimeout(() => {
    errorDiv.style.opacity = '0';
    setTimeout(() => errorDiv.remove(), 300);
  }, 3000);
}

function incrementUnreadCount(userId) {
  try {
    if (!userId) return;
    
    if (!unreadMessages[userId]) unreadMessages[userId] = 0;
    unreadMessages[userId]++;
    
    const badge = document.getElementById(`unread-${userId}`);
    if (badge) {
      badge.textContent = unreadMessages[userId] > 9 ? '9+' : unreadMessages[userId];
      badge.style.display = 'flex';
      badge.classList.add('pulse');
      setTimeout(() => badge.classList.remove('pulse'), 1500);
    }
  } catch (error) {
    console.error('Erreur incrementUnreadCount:', error);
    showError('Erreur de mise à jour des messages non lus');
  }
}

function resetUnreadCount(userId) {
  try {
    if (!userId) return;
    
    unreadMessages[userId] = 0;
    const badge = document.getElementById(`unread-${userId}`);
    if (badge) {
      badge.textContent = '0';
      badge.style.display = 'none';
      badge.classList.remove('pulse');
    }
  } catch (error) {
    console.error('Erreur resetUnreadCount:', error);
    showError('Erreur de réinitialisation des messages non lus');
  }
}

function markAllMessagesAsRead(userId) {
  if (!userId || !socket) return;
  
  socket.emit('mark-messages-read', {
    senderId: userId,
    receiverId: '<%= user._id %>'
  }, (response) => {
    if (response?.success) {
      resetUnreadCount(userId);
    }
  });
}

function checkForUnreadMessages() {
  if (!socket) return;
  
  socket.emit('get-unread-counts', '<%= user._id %>', (counts) => {
    try {
      counts?.forEach(count => {
        if (count.senderId && count.unreadCount >= 0) {
          unreadMessages[count.senderId] = count.unreadCount;
          const badge = document.getElementById(`unread-${count.senderId}`);
          if (badge) {
            badge.textContent = count.unreadCount > 9 ? '9+' : count.unreadCount;
            badge.style.display = count.unreadCount > 0 ? 'flex' : 'none';
          }
        }
      });
    } catch (error) {
      console.error('Erreur traitement messages non lus:', error);
    }
  });
}

function initSocket() {
  try {
    socket = io('/user-namespace', {
      query: { userId: '<%= user._id %>' },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket']
    });

    socket.on('connect', () => {
      console.log('Connecté au serveur Socket.io');
      socket.emit('request-online-users');
      checkForUnreadMessages();
    });

    socket.on('connect_error', (err) => {
      console.error('Erreur connexion Socket.io:', err);
      setTimeout(() => socket.connect(), 2000);
    });

    socket.on('online-users-updated', (userIds) => {
      console.log('Utilisateurs en ligne:', userIds);
      onlineUsers.clear();
      userIds.forEach(id => onlineUsers.add(id));
      
      document.querySelectorAll('.user-item').forEach(item => {
        const userId = item.dataset.userId;
        const isOnline = onlineUsers.has(userId);
        const statusElement = item.querySelector('.status');
        if (statusElement) {
          statusElement.textContent = isOnline ? '🟢 En ligne' : '🔴 Hors ligne';
          statusElement.className = isOnline ? 'status online' : 'status offline';
        }
      });

      if (currentChatUserId) {
        const isOnline = onlineUsers.has(currentChatUserId);
        currentChatUserOnlineStatus = isOnline;
        updateChatUserStatus(isOnline);
      }
    });

    socket.on('user-status-updated', ({ userId, isOnline }) => {
      console.log(`Statut mis à jour: ${userId} - ${isOnline ? 'en ligne' : 'hors ligne'}`);
      updateUserStatus(userId, isOnline);
      if (currentChatUserId === userId) {
        currentChatUserOnlineStatus = isOnline;
        updateChatUserStatus(isOnline);
      }
    });

    socket.on('new-message', (message) => {
      try {
        console.log('Nouveau message:', message);
        if (!message.senderId || !message.receiverId) return;
        
        // Si le chat est ouvert avec cet utilisateur
        if (currentChatUserId === message.senderId) {
          addMessageToChat(message, false);
          playNotificationSound();
          markAllMessagesAsRead(message.senderId);
        } 
        // Si le message est pour moi mais pas dans le chat actuel
        else if (message.receiverId === '<%= user._id %>') {
          incrementUnreadCount(message.senderId);
          playNotificationSound();
        }
      } catch (error) {
        console.error('Erreur nouveau message:', error);
      }
    });

    socket.on('previous-messages', (messages) => {
      console.log('Messages précédents:', messages.length);
      const messageContainer = document.getElementById('messageContainer');
      messageContainer.innerHTML = '';
      lastDisplayedDate = null;
      
      if (messages.length === 0) {
        messageContainer.innerHTML = `
          <div class="empty-chat">
            <i class="fas fa-comments"></i>
            <p>Commencez la conversation avec <span id="emptyChatUserName"></span></p>
            <p class="empty-chat-status" id="emptyChatStatus"></p>
          </div>
        `;
        document.getElementById('emptyChatUserName').textContent = 
          document.getElementById('chatUserName').textContent;
        updateEmptyChatStatus();
      } else {
        messages.forEach(msg => {
          const isSent = msg.senderId === '<%= user._id %>';
          addMessageToChat(msg, isSent);
        });
      }
      scrollToBottom();
      
      if (currentChatUserId) {
        markAllMessagesAsRead(currentChatUserId);
      }
    });

    socket.on('typing', (userId) => {
      if (currentChatUserId === userId) {
        showTypingIndicator(userId);
      }
    });

    socket.on('stop-typing', (userId) => {
      if (currentChatUserId === userId) {
        hideTypingIndicator();
      }
    });

    socket.on('unread-updated', ({ senderId, unreadCount }) => {
      try {
        if (senderId && unreadCount >= 0) {
          unreadMessages[senderId] = unreadCount;
          const badge = document.getElementById(`unread-${senderId}`);
          if (badge) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
          }
        }
      } catch (error) {
        console.error('Erreur mise à jour unread:', error);
      }
    });

  } catch (error) {
    console.error('Erreur initialisation Socket.io:', error);
  }
}

function updateEmptyChatStatus() {
  const statusElement = document.getElementById('emptyChatStatus');
  if (statusElement) {
    statusElement.textContent = currentChatUserOnlineStatus ? 
      '🟢 En ligne - Actif maintenant' : 
      '🔴 Hors ligne';
    statusElement.className = currentChatUserOnlineStatus ? 
      'empty-chat-status online' : 'empty-chat-status offline';
  }
}

function updateUserStatus(userId, isOnline) {
  const userItem = document.querySelector(`.user-item[data-user-id="${userId}"]`);
  if (userItem) {
    const statusElement = userItem.querySelector('.status');
    if (statusElement) {
      statusElement.textContent = isOnline ? '🟢 En ligne' : '🔴 Hors ligne';
      statusElement.className = isOnline ? 'status online' : 'status offline';
    }
  }
}

function updateChatUserStatus(isOnline) {
  currentChatUserOnlineStatus = isOnline;
  const statusElement = document.getElementById('chatUserStatus');
  if (statusElement) {
    statusElement.textContent = isOnline ? '🟢 En ligne - Actif maintenant' : '🔴 Hors ligne';
    statusElement.className = isOnline ? 'user-status online' : 'user-status offline';
  }
  updateEmptyChatStatus();
}

function openChat(userId, userName, userImage, isOnline) {
  try {
    if (!userId) return;
    
    const chatModal = document.getElementById('chatModal');
    if (currentChatUserId === userId && chatModal.classList.contains('open')) {
      closeChat();
      return;
    }

    document.getElementById('chatUserName').textContent = userName;
    document.getElementById('chatUserImage').src = `/images/${userImage}`;
    
    chatModal.classList.add('open');
    currentChatUserId = userId;
    
    // Vérifier le statut actuel
    const isOnlineNow = onlineUsers.has(userId);
    currentChatUserOnlineStatus = isOnlineNow;
    updateChatUserStatus(isOnlineNow);
    
    setTimeout(() => document.getElementById('chatInput').focus(), 300);
    
    socket.emit('get-messages', {
      senderId: '<%= user._id %>',
      receiverId: userId
    });

    // Marquer tous les messages comme lus
    markAllMessagesAsRead(userId);
    
  } catch (error) {
    console.error('Erreur ouverture chat:', error);
  }
}

function closeChat() {
  document.getElementById('chatModal').classList.remove('open');
  currentChatUserId = null;
  hideTypingIndicator();
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();

  if (message && currentChatUserId) {
    const newMessage = {
      senderId: '<%= user._id %>',
      senderName: '<%= user.name %>',
      receiverId: currentChatUserId,
      content: message,
      timestamp: new Date()
    };

    addMessageToChat(newMessage, true);
    socket.emit('send-message', newMessage);
    input.value = '';
    input.focus();
    stopTyping();
  }
}

function addMessageToChat(message, isSent) {
  const messageContainer = document.getElementById('messageContainer');
  
  if (messageContainer.querySelector('.empty-chat')) {
    messageContainer.innerHTML = '';
  }

  const messageDate = new Date(message.timestamp).toLocaleDateString();
  if (messageDate !== lastDisplayedDate) {
    const dateDiv = document.createElement('div');
    dateDiv.className = 'message-date';
    dateDiv.textContent = messageDate;
    messageContainer.appendChild(dateDiv);
    lastDisplayedDate = messageDate;
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
  
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageDiv.innerHTML = `
    <div class="message-content">${message.content}</div>
    <div class="message-info">
      <span class="message-time">${time}</span>
      ${isSent ? '<i class="fas fa-check-double seen-icon"></i>' : ''}
    </div>
  `;
  
  messageContainer.appendChild(messageDiv);
  scrollToBottom();
}

function showTypingIndicator(userId) {
  const typingIndicator = document.getElementById('typingIndicator');
  const typingText = document.getElementById('typingText');
  const userName = document.getElementById('chatUserName').textContent;
  
  typingText.textContent = `${userName} écrit...`;
  typingIndicator.style.display = 'flex';
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => hideTypingIndicator(), 3000);
  
  scrollToBottom();
}

function hideTypingIndicator() {
  document.getElementById('typingIndicator').style.display = 'none';
}

function scrollToBottom() {
  const chatBox = document.getElementById('chatBox');
  chatBox.scrollTop = chatBox.scrollHeight;
}

function playNotificationSound() {
  const audio = new Audio('/sounds/notification.mp3');
  audio.play().catch(e => console.log('Notification sound error:', e));
}

function startTyping() {
  const now = Date.now();
  if (!isTyping && currentChatUserId && (now - lastTypingTime > 1000)) {
    isTyping = true;
    socket.emit('typing', currentChatUserId);
  }
  lastTypingTime = now;
}

function stopTyping() {
  if (isTyping && currentChatUserId) {
    isTyping = false;
    socket.emit('stop-typing', currentChatUserId);
  }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  
  // Vérifier périodiquement les messages non lus (toutes les 30 secondes)
  setInterval(checkForUnreadMessages, 30000);
});

// Gestion des événements
document.getElementById('chatInput').addEventListener('input', function(e) {
  if (currentChatUserId) {
    if (e.target.value.trim() !== '') {
      startTyping();
    } else {
      stopTyping();
    }
  }
});

document.getElementById('chatInput').addEventListener('blur', stopTyping);

document.getElementById('chatInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Vérification périodique de l'état de frappe
setInterval(() => {
  if (isTyping && (Date.now() - lastTypingTime > 2000)) {
    stopTyping();
  }
}, 500);
// Gestion du menu actif
document.querySelectorAll('.nav-item a').forEach(link => {
if(link.href === window.location.href) {
link.parentElement.classList.add('active');
}
});

// Pour les liens qui pointent vers dashboard (peut être la même URL)
if(window.location.pathname === '/dashboard') {
document.querySelector('.nav-item a[href="/dashboard"]').parentElement.classList.add('active');
}
