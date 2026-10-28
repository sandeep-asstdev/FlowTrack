import { io, Socket } from 'socket.io-client';

function isLocalHostname(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
  );
}

const SOCKET_URL =
  (import.meta as any).env?.VITE_SOCKET_URL ||
  ((import.meta as any).env?.VITE_API_URL
    ? new URL((import.meta as any).env.VITE_API_URL).origin
    : typeof window !== 'undefined' && !isLocalHostname(window.location.hostname)
    ? 'https://flowtrack-api-rss4.onrender.com'
    : typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? `http://${window.location.hostname}:3001`
    : 'http://localhost:3001');

class SocketService {
  private socket: Socket | null = null;
  private currentProjectId: string | null = null;
  private currentUserId: string | null = null;

  connect() {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to FlowTrack realtime server:', this.socket?.id);
      if (this.currentProjectId) {
        this.joinProject(this.currentProjectId);
      }
      if (this.currentUserId) {
        this.joinUser(this.currentUserId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Realtime disconnected:', reason);
    });

    return this.socket;
  }

  getSocket(): Socket {
    if (!this.socket) {
      return this.connect();
    }
    return this.socket;
  }

  joinProject(projectId: string) {
    this.currentProjectId = projectId;
    const socket = this.getSocket();
    socket.emit('join:project', { projectId });
  }

  leaveProject(projectId: string) {
    if (this.currentProjectId === projectId) {
      this.currentProjectId = null;
    }
    const socket = this.getSocket();
    socket.emit('leave:project', { projectId });
  }

  joinUser(userId: string) {
    this.currentUserId = userId;
    const socket = this.getSocket();
    socket.emit('join:user', { userId });
  }

  joinNode(nodeId: string) {
    const socket = this.getSocket();
    socket.emit('join:node', { nodeId });
  }

  on(event: string, callback: (...args: any[]) => void) {
    const socket = this.getSocket();
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }

  off(event: string, callback?: (...args: any[]) => void) {
    const socket = this.getSocket();
    if (callback) {
      socket.off(event, callback);
    } else {
      socket.off(event);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
