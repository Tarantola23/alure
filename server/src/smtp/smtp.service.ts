import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import nodemailer from 'nodemailer';
import { createHash } from 'crypto';
import { decryptSecret, encryptSecret } from './smtp.crypto';
import { SmtpSettingsDto, UpdateSmtpSettingsDto } from './smtp.types';

const getSecret = (): string => {
  return process.env.SMTP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-secret';
};

type LicenseEmailPayload = {
  toEmail: string;
  projectName: string;
  plan: string;
  maxActivations: number;
  durationDays?: number;
  expiresAt?: Date;
  licenseKey: string;
};

type InviteEmailPayload = {
  toEmail: string;
  name?: string;
  temporaryPassword: string;
  inviteUrl: string;
  expiresAt: Date;
};

@Injectable()
export class SmtpService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SmtpSettingsDto | null> {
    const settings = await this.prisma.smtpSettings.findFirst();
    if (!settings) return null;
    return {
      host: settings.host,
      port: settings.port,
      username: settings.username,
      from_email: settings.fromEmail,
      from_name: settings.fromName ?? undefined,
      secure: settings.secure,
      has_password: Boolean(settings.passwordEnc),
      verified: Boolean(settings.verifiedAt),
      verified_at: settings.verifiedAt ? settings.verifiedAt.toISOString() : undefined,
    };
  }

  async updateSettings(payload: UpdateSmtpSettingsDto): Promise<SmtpSettingsDto> {
    const secret = getSecret();
    const existing = await this.prisma.smtpSettings.findFirst();
    const passwordEnc =
      payload.password?.trim().length
        ? encryptSecret(payload.password, secret)
        : existing?.passwordEnc ?? '';

    if (!passwordEnc) {
      throw new BadRequestException('missing_password');
    }

    const settings = existing
      ? await this.prisma.smtpSettings.update({
          where: { id: existing.id },
          data: {
            host: payload.host,
            port: payload.port,
            username: payload.username,
            passwordEnc,
            fromEmail: payload.from_email,
            fromName: payload.from_name ?? null,
            secure: payload.secure,
            verifiedAt: null,
            verificationCodeHash: null,
            verificationCodeExpiresAt: null,
          },
        })
      : await this.prisma.smtpSettings.create({
          data: {
            host: payload.host,
            port: payload.port,
            username: payload.username,
            passwordEnc,
            fromEmail: payload.from_email,
            fromName: payload.from_name ?? null,
            secure: payload.secure,
            verifiedAt: null,
            verificationCodeHash: null,
            verificationCodeExpiresAt: null,
          },
        });

    return {
      host: settings.host,
      port: settings.port,
      username: settings.username,
      from_email: settings.fromEmail,
      from_name: settings.fromName ?? undefined,
      secure: settings.secure,
      has_password: Boolean(settings.passwordEnc),
      verified: Boolean(settings.verifiedAt),
      verified_at: settings.verifiedAt ? settings.verifiedAt.toISOString() : undefined,
    };
  }

  async assertVerified(): Promise<void> {
    const settings = await this.prisma.smtpSettings.findFirst();
    if (!settings?.verifiedAt) {
      throw new BadRequestException('smtp_not_verified');
    }
  }

  private async getVerifiedTransport(): Promise<{
    transport: nodemailer.Transporter;
    fromLabel: string;
  }> {
    const settings = await this.prisma.smtpSettings.findFirst();
    if (!settings?.verifiedAt) {
      throw new BadRequestException('smtp_not_verified');
    }
    const secret = getSecret();
    const password = decryptSecret(settings.passwordEnc, secret);
    const transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: {
        user: settings.username,
        pass: password,
      },
    });
    const fromLabel = settings.fromName
      ? `${settings.fromName} <${settings.fromEmail}>`
      : settings.fromEmail;
    return { transport, fromLabel };
  }

  async sendTestEmail(toEmail: string): Promise<void> {
    const settings = await this.prisma.smtpSettings.findFirst();
    if (!settings) {
      throw new BadRequestException('smtp_not_configured');
    }

    const secret = getSecret();
    const password = decryptSecret(settings.passwordEnc, secret);
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: {
        user: settings.username,
        pass: password,
      },
    });

    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.smtpSettings.update({
      where: { id: settings.id },
      data: {
        verificationCodeHash: codeHash,
        verificationCodeExpiresAt: expiresAt,
      },
    });

    const fromLabel = settings.fromName
      ? `${settings.fromName} <${settings.fromEmail}>`
      : settings.fromEmail;

    await transporter.sendMail({
      from: fromLabel,
      to: toEmail,
      subject: `Alure SMTP verification code: ${code}`,
      text: `Your SMTP settings are saved.\n\nVerification code: ${code}\n\nEnter this code in the dashboard to verify SMTP.`,
    });
  }

  async sendLicenseEmail(payload: LicenseEmailPayload): Promise<void> {
    const { transport, fromLabel } = await this.getVerifiedTransport();
    const expiresLabel = payload.expiresAt
      ? payload.expiresAt.toLocaleDateString()
      : payload.durationDays
        ? `${payload.durationDays} days`
        : 'No expiry';
    const html = `
      <div style="font-family: 'Space Grotesk', Arial, sans-serif; color: #1e2a35; background:#ffffff; padding: 24px;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom: 18px;">
          <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="10" fill="#1f5663"/>
            <path d="M11 24V12h6.6c3.8 0 6.4 2.3 6.4 6s-2.6 6-6.4 6H11Zm3.6-3h3c1.8 0 3-1.2 3-3s-1.2-3-3-3h-3v6Z" fill="#F8FBFC"/>
          </svg>
          <div style="font-size: 20px; font-weight: 700; color:#1f5663;">Alure</div>
        </div>
        <h2 style="margin: 0 0 8px; font-size: 18px;">Your license is ready</h2>
        <p style="margin: 0 0 16px; color:#5f6b7a;">Project: ${payload.projectName}</p>
        <div style="padding: 12px 14px; border-radius: 12px; background:#f3f7fb; border:1px solid rgba(31, 86, 99, 0.2);">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color:#5f6b7a;">License key</div>
          <div style="font-family: 'Courier New', monospace; font-size: 16px; margin-top: 6px;">${payload.licenseKey}</div>
        </div>
        <div style="display:grid; gap:6px; margin-top: 16px; font-size: 13px;">
          <div><strong>Plan:</strong> ${payload.plan}</div>
          <div><strong>Max activations:</strong> ${payload.maxActivations}</div>
          <div><strong>Validity:</strong> ${expiresLabel}</div>
        </div>
        <p style="margin-top: 18px; font-size: 12px; color:#7b8794;">Keep this email safe. You'll need this key to activate your license.</p>
      </div>
    `;
    const text = `Alure license for ${payload.projectName}\n\nLicense key: ${payload.licenseKey}\nPlan: ${payload.plan}\nMax activations: ${payload.maxActivations}\nValidity: ${expiresLabel}\n`;

    await transport.sendMail({
      from: fromLabel,
      to: payload.toEmail,
      subject: `Your ${payload.projectName} license key`,
      text,
      html,
    });
  }

  async sendInviteEmail(payload: InviteEmailPayload): Promise<void> {
    const { transport, fromLabel } = await this.getVerifiedTransport();
    const expiresLabel = payload.expiresAt.toLocaleString();
    const greeting = payload.name ? `Hi ${payload.name},` : 'Hi,';
    const html = `
      <div style="font-family: 'Space Grotesk', Arial, sans-serif; color: #1e2a35; background:#ffffff; padding: 24px;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom: 18px;">
          <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="10" fill="#1f5663"/>
            <path d="M11 24V12h6.6c3.8 0 6.4 2.3 6.4 6s-2.6 6-6.4 6H11Zm3.6-3h3c1.8 0 3-1.2 3-3s-1.2-3-3-3h-3v6Z" fill="#F8FBFC"/>
          </svg>
          <div style="font-size: 20px; font-weight: 700; color:#1f5663;">Alure</div>
        </div>
        <h2 style="margin: 0 0 8px; font-size: 18px;">You've been invited</h2>
        <p style="margin: 0 0 14px; color:#5f6b7a;">${greeting} your Alure account is ready.</p>
        <div style="padding: 12px 14px; border-radius: 12px; background:#f3f7fb; border:1px solid rgba(31, 86, 99, 0.2);">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color:#5f6b7a;">Temporary password</div>
          <div style="font-family: 'Courier New', monospace; font-size: 16px; margin-top: 6px;">${payload.temporaryPassword}</div>
        </div>
        <p style="margin: 16px 0 6px; font-size: 13px;">Set a new password using this link (valid until ${expiresLabel}):</p>
        <p style="margin: 0 0 16px;"><a href="${payload.inviteUrl}" style="color:#1f5663;">${payload.inviteUrl}</a></p>
        <p style="margin-top: 16px; font-size: 12px; color:#7b8794;">If you did not expect this invite, you can ignore this email.</p>
      </div>
    `;
    const text = `Alure invite\n\nTemporary password: ${payload.temporaryPassword}\nSet a new password (valid until ${expiresLabel}): ${payload.inviteUrl}\n`;

    await transport.sendMail({
      from: fromLabel,
      to: payload.toEmail,
      subject: 'You have been invited to Alure',
      text,
      html,
    });
  }

  async verifyCode(code: string): Promise<boolean> {
    const settings = await this.prisma.smtpSettings.findFirst();
    if (!settings?.verificationCodeHash || !settings.verificationCodeExpiresAt) {
      throw new BadRequestException('missing_verification_code');
    }
    if (new Date() > settings.verificationCodeExpiresAt) {
      throw new BadRequestException('verification_code_expired');
    }
    const hash = createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
    if (hash !== settings.verificationCodeHash) {
      throw new BadRequestException('invalid_verification_code');
    }
    await this.prisma.smtpSettings.update({
      where: { id: settings.id },
      data: {
        verifiedAt: new Date(),
        verificationCodeHash: null,
        verificationCodeExpiresAt: null,
      },
    });
    return true;
  }
}
