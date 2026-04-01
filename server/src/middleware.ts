import type { Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { verifyToken } from './auth.js';
import { findUserById } from './db.js';

declare module 'socket.io' {
  interface SocketData {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    isGuest: boolean;
  }
}

/**
 * Socket.IO auth middleware.
 * If a valid JWT is provided, attaches the authenticated user.
 * If no token, assigns a guest identity (reusing client-provided guestId if available).
 */
export function authMiddleware(socket: Socket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth.token as string | undefined;

  if (token) {
    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Invalid token'));
    }
    const user = findUserById(payload.sub);
    if (!user) {
      return next(new Error('User not found'));
    }
    socket.data.userId = user.id;
    socket.data.displayName = user.display_name;
    socket.data.avatarUrl = user.avatar_url ?? undefined;
    socket.data.isGuest = false;
  } else {
    // Guest mode — reuse client-provided ID for stable identity across reconnects
    const clientGuestId = socket.handshake.auth.guestId as string | undefined;
    const clientGuestName = socket.handshake.auth.guestName as string | undefined;

    if (clientGuestId && clientGuestId.startsWith('guest_')) {
      socket.data.userId = clientGuestId;
      socket.data.displayName = clientGuestName || `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
    } else {
      socket.data.userId = `guest_${nanoid(8)}`;
      socket.data.displayName = `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
    }
    socket.data.isGuest = true;
  }

  next();
}

/**
 * Bidirectional mapping between userId and socket.id.
 */
export class UserSocketMap {
  private userToSocket = new Map<string, string>();
  private socketToUser = new Map<string, string>();

  register(userId: string, socketId: string): void {
    const oldSocketId = this.userToSocket.get(userId);
    if (oldSocketId) {
      this.socketToUser.delete(oldSocketId);
    }
    this.userToSocket.set(userId, socketId);
    this.socketToUser.set(socketId, userId);
  }

  unregister(socketId: string): void {
    const userId = this.socketToUser.get(socketId);
    if (userId) {
      this.userToSocket.delete(userId);
    }
    this.socketToUser.delete(socketId);
  }

  getSocketId(userId: string): string | undefined {
    return this.userToSocket.get(userId);
  }

  getUserId(socketId: string): string | undefined {
    return this.socketToUser.get(socketId);
  }
}
