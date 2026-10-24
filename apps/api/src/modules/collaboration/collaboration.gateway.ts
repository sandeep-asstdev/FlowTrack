import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class CollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(CollaborationGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:project')
  handleJoinProject(@ConnectedSocket() client: Socket, @MessageBody() data: { projectId: string }) {
    if (data?.projectId) {
      const room = `project:${data.projectId}`;
      client.join(room);
      this.logger.debug(`Client ${client.id} joined ${room}`);
      return { status: 'joined', room };
    }
  }

  @SubscribeMessage('leave:project')
  handleLeaveProject(@ConnectedSocket() client: Socket, @MessageBody() data: { projectId: string }) {
    if (data?.projectId) {
      const room = `project:${data.projectId}`;
      client.leave(room);
      this.logger.debug(`Client ${client.id} left ${room}`);
      return { status: 'left', room };
    }
  }

  @SubscribeMessage('join:user')
  handleJoinUser(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string }) {
    if (data?.userId) {
      const room = `user:${data.userId}`;
      client.join(room);
      this.logger.debug(`Client ${client.id} joined ${room}`);
      return { status: 'joined', room };
    }
  }

  @SubscribeMessage('join:node')
  handleJoinNode(@ConnectedSocket() client: Socket, @MessageBody() data: { nodeId: string }) {
    if (data?.nodeId) {
      const room = `node:${data.nodeId}`;
      client.join(room);
      this.logger.debug(`Client ${client.id} joined ${room}`);
      return { status: 'joined', room };
    }
  }

  /**
   * Broadcast an event to everyone currently viewing the project canvas.
   */
  broadcastToProject(projectId: string, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`project:${projectId}`).emit(event, payload);
  }

  /**
   * Send a targeted notification or alert to a specific user.
   */
  sendToUser(userId: string, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /**
   * Broadcast an event to users inspecting a specific task/node.
   */
  broadcastToNode(nodeId: string, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`node:${nodeId}`).emit(event, payload);
  }
}
