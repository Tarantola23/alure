import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  ActivateRequestDto,
  ActivateResponseDto,
  ActivationListItemDto,
  CreateLicenseRequestDto,
  CreateLicenseResponseDto,
  LicenseListItemDto,
  RevokeRequestDto,
  RevokeResponseDto,
  VerifyRequestDto,
  VerifyResponseDto,
} from './licensing.types';
import { PrismaService } from '../prisma/prisma.service';
import { createReceipt, verifyReceipt } from './receipt';

@Injectable()
export class LicensingService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private generateLicenseKey(): string {
    const segment = () => randomBytes(3).toString('hex').toUpperCase();
    return `ALR-${segment()}-${segment()}-${segment()}`;
  }

  async listLicenses(projectId?: string): Promise<LicenseListItemDto[]> {
    const licenses = await this.prisma.license.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return licenses.map((license) => ({
      license_id: license.id,
      project_id: license.projectId,
      plan: license.plan,
      max_activations: license.maxActivations,
      revoked: license.revoked,
      duration_days: license.durationDays ?? undefined,
      notes: license.notes ?? undefined,
      expires_at: license.expiresAt ? license.expiresAt.toISOString() : undefined,
      created_at: license.createdAt.toISOString(),
    }));
  }

  async createLicense(body: CreateLicenseRequestDto): Promise<CreateLicenseResponseDto> {
    const licenseKey = this.generateLicenseKey();
    const licenseKeyHash = this.hash(licenseKey);

    const plan = await this.prisma.plan.findUnique({ where: { name: body.plan } });
    if (!plan) {
      throw new HttpException('plan_not_found', HttpStatus.BAD_REQUEST);
    }

    const durationDays = body.duration_days ?? plan.durationDaysDefault ?? null;
    const expiresAt = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;

    const license = await this.prisma.license.create({
      data: {
        projectId: body.project_id,
        licenseKeyHash,
        plan: body.plan,
        maxActivations: body.max_activations,
        durationDays,
        expiresAt,
        notes: body.notes?.trim() || null,
      },
    });

    return {
      license_id: license.id,
      license_key: licenseKey,
    };
  }

  async listActivations(licenseId: string): Promise<ActivationListItemDto[]> {
    const activations = await this.prisma.activation.findMany({
      where: { licenseId },
      orderBy: { createdAt: 'desc' },
    });

    return activations.map((activation) => ({
      activation_id: activation.id,
      device_id_hash: activation.deviceIdHash,
      revoked: activation.revoked,
      created_at: activation.createdAt.toISOString(),
    }));
  }

  async activate(body: ActivateRequestDto): Promise<ActivateResponseDto> {
    const now = new Date();
    const licenseKeyHash = this.hash(body.license_key);
    const deviceIdHash = this.hash(body.device_id);

    return this.prisma.$transaction(async (tx) => {
      const license = await tx.license.findUnique({
        where: { licenseKeyHash },
      });

      if (!license) {
        throw new HttpException('license_not_found', HttpStatus.NOT_FOUND);
      }

      if (license.revoked) {
        throw new HttpException('license_revoked', HttpStatus.FORBIDDEN);
      }

      if (license.expiresAt && now > license.expiresAt) {
        throw new HttpException('license_expired', HttpStatus.FORBIDDEN);
      }

      const activeCount = await tx.activation.count({
        where: { licenseId: license.id, revoked: false },
      });

      if (license.maxActivations > 0 && activeCount >= license.maxActivations) {
        throw new HttpException('activation_limit_reached', HttpStatus.CONFLICT);
      }

      const plan = await tx.plan.findUnique({ where: { name: license.plan } });
      const graceDays = plan?.gracePeriodDays ?? 14;
      const activationId = `act_${randomUUID()}`;
      const receipt = createReceipt({
        v: 1,
        license_id: license.id,
        project_id: license.projectId,
        activation_id: activationId,
        device_id_hash: deviceIdHash,
        plan: license.plan,
        max_activations: license.maxActivations,
        issued_at: now.toISOString(),
        expires_at: license.expiresAt ? license.expiresAt.toISOString() : null,
        grace_period_days: graceDays,
      });
      const activation = await tx.activation.create({
        data: {
          id: activationId,
          licenseId: license.id,
          deviceIdHash,
          receiptHash: this.hash(receipt),
        },
      });

      return {
        receipt,
        activation_id: activation.id,
        expires_at: license.expiresAt ? license.expiresAt.toISOString() : undefined,
        grace_period_days: graceDays,
        server_time: now.toISOString(),
      };
    });
  }

  async verify(body: VerifyRequestDto): Promise<VerifyResponseDto> {
    const now = new Date();
    const receiptHash = this.hash(body.receipt);

    return this.prisma.$transaction(async (tx) => {
      const parsed = verifyReceipt(body.receipt);
      const legacyReceipt = !parsed.valid || !parsed.payload;
      const payload = legacyReceipt ? undefined : parsed.payload;

      const activation = await tx.activation.findUnique({
        where: { receiptHash },
        include: { license: true },
      });

      if (
        !activation ||
        activation.revoked ||
        activation.license.revoked ||
        activation.deviceIdHash !== this.hash(body.device_id)
      ) {
        return {
          valid: false,
          reason: 'invalid_or_revoked',
          server_time: now.toISOString(),
        };
      }

      if (payload) {
        if (
          payload.activation_id !== activation.id ||
          payload.license_id !== activation.license.id ||
          payload.device_id_hash !== activation.deviceIdHash
        ) {
          return {
            valid: false,
            reason: 'invalid_receipt',
            server_time: now.toISOString(),
          };
        }
      }

      const expiresAt = payload?.expires_at
        ? new Date(payload.expires_at)
        : activation.license.expiresAt ?? null;
      if (expiresAt && now > expiresAt) {
        const graceDays = payload?.grace_period_days ?? 14;
        const graceMs = graceDays * 24 * 60 * 60 * 1000;
        if (now.getTime() > expiresAt.getTime() + graceMs) {
          return {
            valid: false,
            reason: 'expired',
            server_time: now.toISOString(),
          };
        }
        return {
          valid: true,
          reason: 'grace_period',
          new_receipt: body.receipt,
          expires_at: expiresAt.toISOString(),
          server_time: now.toISOString(),
        };
      }

      return {
        valid: true,
        reason: legacyReceipt ? 'legacy_receipt' : undefined,
        new_receipt: body.receipt,
        expires_at: expiresAt ? expiresAt.toISOString() : undefined,
        server_time: now.toISOString(),
      };
    });
  }

  async revoke(_body: RevokeRequestDto): Promise<RevokeResponseDto> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      if (_body.activation_id) {
        await tx.activation.updateMany({
          where: { id: _body.activation_id },
          data: { revoked: true },
        });
      }

      if (_body.license_id) {
        await tx.license.updateMany({
          where: { id: _body.license_id },
          data: { revoked: true },
        });
        await tx.activation.updateMany({
          where: { licenseId: _body.license_id },
          data: { revoked: true },
        });
      }

      return {
        revoked: Boolean(_body.activation_id || _body.license_id),
        server_time: now.toISOString(),
      };
    });
  }
}
