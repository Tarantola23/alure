import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  BootstrapRequestDto,
  LoginRequestDto,
  UpdateProfileDto,
  UserProfileDto,
} from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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
}
