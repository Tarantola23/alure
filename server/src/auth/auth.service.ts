import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import {
  AcceptInviteRequestDto,
  AcceptInviteResponseDto,
  BootstrapRequestDto,
  CreateUserRequestDto,
  CreateUserResponseDto,
  InviteStatusResponseDto,
  ResendInviteResponseDto,
  LoginRequestDto,
  UpdateProfileDto,
  UserListItemDto,
  UserProfileDto,
} from './auth.types';
import { SmtpService } from '../smtp/smtp.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly smtpService: SmtpService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateOtp(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  private getDashboardUrl(): string {
    return process.env.DASHBOARD_URL || 'http://localhost:5173';
  }

  async ensureDefaultAdmin(): Promise<void> {
    if (process.env.AUTO_CREATE_ADMIN !== 'true') {
      return;
    }
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const totalUsers = await this.prisma.user.count();
    if (totalUsers > 0) {
      return;
    }
    const existing = await this.prisma.user.findUnique({ where: { email: adminEmail } });
    if (existing) {
      return;
    }
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await this.prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Admin',
        passwordHash,
        role: 'admin',
      },
    });
  }

  async hasAdmin(): Promise<boolean> {
    const totalUsers = await this.prisma.user.count();
    return totalUsers > 0;
  }

  async bootstrapAdmin(body: BootstrapRequestDto): Promise<{ token: string; user: UserProfileDto }> {
    const totalUsers = await this.prisma.user.count();
    if (totalUsers > 0) {
      throw new BadRequestException('admin_exists');
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: body.email,
        name: body.name?.trim() || 'Admin',
        passwordHash,
        role: 'admin',
      },
    });
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, secret, {
      expiresIn: '8h',
    });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async login(body: LoginRequestDto): Promise<{ token: string; user: UserProfileDto }> {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      throw new UnauthorizedException('invalid_credentials');
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('invalid_credentials');
    }
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, secret, {
      expiresIn: '8h',
    });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('user_not_found');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async updateProfile(userId: string, body: UpdateProfileDto): Promise<UserProfileDto> {
    const data: { name?: string; email?: string; passwordHash?: string } = {};
    if (body.name) {
      data.name = body.name;
    }
    if (body.email) {
      data.email = body.email;
    }
    if (body.password) {
      data.passwordHash = await bcrypt.hash(body.password, 10);
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('user_not_found');
    }
    return bcrypt.compare(password, user.passwordHash);
  }

  async createUserInvite(body: CreateUserRequestDto): Promise<CreateUserResponseDto> {
    const email = body.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('user_exists');
    }

    await this.smtpService.assertVerified();

    const tempPassword = this.generateOtp();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: body.name?.trim() || 'User',
        passwordHash,
        role: body.role?.trim() || 'user',
      },
    });

    const token = randomBytes(24).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.userInvite.create({
      data: {
        userId: user.id,
        tokenHash,
        tempPasswordHash,
        expiresAt,
      },
    });

    const inviteUrl = `${this.getDashboardUrl()}/invite?token=${token}`;
    await this.smtpService.sendInviteEmail({
      toEmail: user.email,
      name: user.name,
      temporaryPassword: tempPassword,
      inviteUrl,
      expiresAt,
    });

    return {
      user_id: user.id,
      email: user.email,
      invite_expires_at: expiresAt.toISOString(),
    };
  }

  async listUsers(): Promise<UserListItemDto[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { invites: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const now = new Date();
    return users.map((user) => {
      const invite = user.invites[0];
      let status: 'accepted' | 'pending' | 'expired' = 'accepted';
      let inviteExpiresAt: string | undefined;
      if (invite) {
        inviteExpiresAt = invite.expiresAt.toISOString();
        if (invite.usedAt) {
          status = 'accepted';
        } else if (invite.expiresAt < now) {
          status = 'expired';
        } else {
          status = 'pending';
        }
      }
      return {
        user_id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        invite_status: status,
        invite_expires_at: inviteExpiresAt,
      };
    });
  }

  async resendInvite(userId: string): Promise<ResendInviteResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('user_not_found');
    }

    await this.smtpService.assertVerified();

    await this.prisma.userInvite.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const tempPassword = this.generateOtp();
    const token = randomBytes(24).toString('hex');
    const tokenHash = this.hashToken(token);
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.prisma.userInvite.create({
      data: {
        userId: user.id,
        tokenHash,
        tempPasswordHash,
        expiresAt,
      },
    });

    const inviteUrl = `${this.getDashboardUrl()}/invite?token=${token}`;
    await this.smtpService.sendInviteEmail({
      toEmail: user.email,
      name: user.name,
      temporaryPassword: tempPassword,
      inviteUrl,
      expiresAt,
    });

    return { user_id: user.id, invite_expires_at: expiresAt.toISOString() };
  }

  async acceptInvite(body: AcceptInviteRequestDto): Promise<AcceptInviteResponseDto> {
    const tokenHash = this.hashToken(body.token);
    const invite = await this.prisma.userInvite.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!invite || invite.usedAt) {
      throw new BadRequestException('invalid_invite');
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('invite_expired');
    }
    if (!invite.tempPasswordHash) {
      throw new BadRequestException('invalid_otp');
    }
    const otpOk = await bcrypt.compare(body.otp, invite.tempPasswordHash);
    if (!otpOk) {
      throw new BadRequestException('invalid_otp');
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: invite.userId },
        data: { passwordHash },
      }),
      this.prisma.userInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { accepted: true };
  }

  async getInviteStatus(token: string): Promise<InviteStatusResponseDto> {
    if (!token?.trim()) {
      return { status: 'invalid' };
    }
    const tokenHash = this.hashToken(token);
    const invite = await this.prisma.userInvite.findUnique({ where: { tokenHash } });
    if (!invite) {
      return { status: 'invalid' };
    }
    if (invite.usedAt) {
      return { status: 'used' };
    }
    if (invite.expiresAt < new Date()) {
      return { status: 'expired' };
    }
    return { status: 'valid' };
  }
}
