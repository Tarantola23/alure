import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';

type AuthPayload = {
  sub: string;
  email: string;
  role: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization as string | undefined;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing_token');
    }
    const token = header.slice('Bearer '.length);
    const secret = process.env.JWT_SECRET || 'dev-secret';
    try {
      const payload = jwt.verify(token, secret) as AuthPayload;
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
  }
}
