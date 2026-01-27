import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  ActivateRequestDto,
  ActivateResponseDto,
  ActivationListItemDto,
  ActivationModulesResponseDto,
  BulkCreateLicenseErrorDto,
  BulkCreateLicenseItemDto,
  BulkCreateLicensesRequestDto,
  BulkCreateLicensesResponseDto,
  CreateLicenseRequestDto,
  CreateLicenseResponseDto,
  LicenseModulesResponseDto,
  LicenseListItemDto,
  RevokeRequestDto,
  RevokeResponseDto,
  UpdateLicenseModulesRequestDto,
  UpdateActivationModulesRequestDto,
  VerifyRequestDto,
  VerifyResponseDto,
} from './licensing.types';
import { PrismaService } from '../prisma/prisma.service';
import { SmtpService } from '../smtp/smtp.service';
import { createReceipt, verifyReceipt } from './receipt';
import { decryptData, encryptData } from '../common/data.crypto';

@Injectable()
export class LicensingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly smtpService: SmtpService,
  ) {}

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private getDataKey(): string {
    return process.env.DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-secret';
  }

  private maskHostname(hostname: string): string {
    if (hostname.length <= 4) {
      return `${hostname[0] ?? ''}***`;
    }
    const start = hostname.slice(0, 2);
    const end = hostname.slice(-2);
    return `${start}***${end}`;
  }

  private generateLicenseKey(): string {
    const segment = () => randomBytes(3).toString('hex').toUpperCase();
    return `ALR-${segment()}-${segment()}-${segment()}`;
  }

  private normalizeParams(value?: Record<string, string> | null): Record<string, string> {
    if (!value) return {};
    const entries = Object.entries(value).filter(([, v]) => typeof v === 'string');
    return Object.fromEntries(entries);
  }

  private mergeParams(
    base?: Record<string, string> | null,
    overrideA?: Record<string, string> | null,
    overrideB?: Record<string, string> | null,
  ): Record<string, string> {
    return {
      ...this.normalizeParams(base),
      ...this.normalizeParams(overrideA),
      ...this.normalizeParams(overrideB),
    };
  }

  private async resolveModuleIds(projectId: string, moduleKeys?: string[]): Promise<string[]> {
    if (!moduleKeys || moduleKeys.length === 0) return [];
    const uniqueKeys = Array.from(new Set(moduleKeys.map((key) => key.trim()).filter(Boolean)));
    const modules = await this.prisma.projectModule.findMany({
      where: { projectId, key: { in: uniqueKeys } },
    });
    if (modules.length !== uniqueKeys.length) {
      throw new HttpException('module_not_found', HttpStatus.BAD_REQUEST);
    }
    return modules.map((module) => module.id);
  }

  private async buildReceiptModules(licenseId: string, activationId?: string) {
    const licenseModules = await this.prisma.licenseModule.findMany({
      where: { licenseId },
      include: { module: true },
    });
    if (licenseModules.length === 0) {
      return [];
    }

    let restrict = false;
    const activationModules = activationId
      ? await this.prisma.activationModule.findMany({
          where: { activationId },
          include: { module: true },
        })
      : [];
    if (activationId) {
      const activation = await this.prisma.activation.findUnique({
        where: { id: activationId },
        select: { modulesRestricted: true },
      });
      restrict = Boolean(activation?.modulesRestricted);
    }
    const activationMap = new Map(activationModules.map((item) => [item.moduleId, item]));

    return licenseModules
      .filter((item) => {
        if (item.forceDeactivation) return false;
        if (!restrict) return true;
        return item.forceActivation || activationMap.has(item.moduleId);
      })
      .map((item) => {
        const activationOverride = activationMap.get(item.moduleId);
        const params = this.mergeParams(item.module.params as Record<string, string> | null, item.params as Record<string, string> | null, activationOverride?.params as Record<string, string> | null);
        return {
          key: item.module.key,
          params: Object.keys(params).length ? params : undefined,
        };
      });
  }

  private hashEmail(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  private extractRecipientFromNotes(notes: string): string | null {
    const match = notes.match(/Recipient:\s*([^|]+)/i);
    return match ? match[1].trim() : null;
  }

  private stripRecipientFromNotes(notes: string): string | null {
    const cleaned = notes
      .split('|')
      .map((part) => part.trim())
      .filter((part) => part && !part.toLowerCase().startsWith('recipient:'));
    if (cleaned.length === 0) {
      return null;
    }
    return cleaned.join(' | ');
  }

  private async backfillBulkRecipientHashes(): Promise<void> {
    const candidates = await this.prisma.license.findMany({
      where: {
        recipientEmailHash: null,
        notes: { contains: 'Recipient:' },
      },
      select: { id: true, notes: true },
    });
    for (const license of candidates) {
      if (!license.notes) continue;
      const email = this.extractRecipientFromNotes(license.notes);
      if (!email) continue;
      const cleanedNotes = this.stripRecipientFromNotes(license.notes);
      await this.prisma.license.update({
        where: { id: license.id },
        data: {
          bulkCreated: true,
          recipientEmailHash: this.hashEmail(email),
          notes: cleanedNotes,
        },
      });
    }
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
      bulk_created: license.bulkCreated,
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

    const moduleIds = await this.resolveModuleIds(body.project_id, body.module_keys);

    const license = await this.prisma.$transaction(async (tx) => {
      const created = await tx.license.create({
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
      if (moduleIds.length > 0) {
        await tx.licenseModule.createMany({
          data: moduleIds.map((moduleId) => ({
            licenseId: created.id,
            moduleId,
          })),
        });
      }
      return created;
    });

    return {
      license_id: license.id,
      license_key: licenseKey,
    };
  }

  async createBulkLicenses(body: BulkCreateLicensesRequestDto): Promise<BulkCreateLicensesResponseDto> {
    const recipients = Array.from(
      new Set(body.recipients.map((email) => email.trim().toLowerCase()).filter(Boolean)),
    );
    if (recipients.length === 0) {
      throw new HttpException('recipients_required', HttpStatus.BAD_REQUEST);
    }

    const plan = await this.prisma.plan.findUnique({ where: { name: body.plan } });
    if (!plan) {
      throw new HttpException('plan_not_found', HttpStatus.BAD_REQUEST);
    }

    const project = await this.prisma.project.findUnique({ where: { id: body.project_id } });
    if (!project) {
      throw new HttpException('project_not_found', HttpStatus.NOT_FOUND);
    }

    await this.backfillBulkRecipientHashes();
    await this.smtpService.assertVerified();

    const durationDays = body.duration_days ?? plan.durationDaysDefault ?? null;
    const expiresAt = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;
    const created: BulkCreateLicenseItemDto[] = [];
    const failed: BulkCreateLicenseErrorDto[] = [];
    const now = new Date();
    const moduleIds = await this.resolveModuleIds(body.project_id, body.module_keys);

    for (const email of recipients) {
      let licenseId: string | undefined;
      let licenseKey: string | undefined;
      try {
        const recipientHash = this.hashEmail(email);
        const existing = await this.prisma.license.findFirst({
          where: {
            projectId: body.project_id,
            plan: body.plan,
            revoked: false,
            recipientEmailHash: recipientHash,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
        });
        if (existing) {
          failed.push({
            email,
            error: 'active_license_exists',
            license_id: existing.id,
          });
          continue;
        }
        licenseKey = this.generateLicenseKey();
        const licenseKeyHash = this.hash(licenseKey);
        const license = await this.prisma.license.create({
          data: {
            projectId: body.project_id,
            licenseKeyHash,
            plan: body.plan,
            maxActivations: body.max_activations,
            durationDays,
            expiresAt,
            notes: body.notes?.trim() || null,
            bulkCreated: true,
            recipientEmailHash: recipientHash,
          },
        });
        if (moduleIds.length > 0) {
          await this.prisma.licenseModule.createMany({
            data: moduleIds.map((moduleId) => ({
              licenseId: license.id,
              moduleId,
            })),
          });
        }
        licenseId = license.id;
        await this.smtpService.sendLicenseEmail({
          toEmail: email,
          projectName: project.name,
          plan: body.plan,
          maxActivations: body.max_activations,
          durationDays: durationDays ?? undefined,
          expiresAt: expiresAt ?? undefined,
          licenseKey,
        });
        created.push({ email, license_id: license.id, license_key: licenseKey });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        failed.push({
          email,
          error: message,
          license_id: licenseId,
          license_key: licenseKey,
        });
      }
    }

    return { created, failed };
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
      last_seen_at: activation.lastSeenAt ? activation.lastSeenAt.toISOString() : undefined,
      hostname_masked: activation.hostnameEnc
        ? (() => {
            try {
              const hostname = decryptData(activation.hostnameEnc, this.getDataKey());
              return this.maskHostname(hostname);
            } catch {
              return undefined;
            }
          })()
        : undefined,
    }));
  }

  async activate(body: ActivateRequestDto): Promise<ActivateResponseDto> {
    const now = new Date();
    const licenseKeyHash = this.hash(body.license_key);
    const deviceIdHash = this.hash(body.device_id);
    const hostnameValue =
      typeof body.device_meta?.hostname === 'string' ? body.device_meta.hostname.trim() : null;
    const hostnameEnc = hostnameValue ? encryptData(hostnameValue, this.getDataKey()) : null;

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

      const existingActivation = await tx.activation.findFirst({
        where: {
          licenseId: license.id,
          deviceIdHash,
          revoked: false,
        },
      });
      if (existingActivation) {
        throw new HttpException('activation_already_exists', HttpStatus.CONFLICT);
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
      const modules = await this.buildReceiptModules(license.id);
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
        modules,
      });
      const activation = await tx.activation.create({
        data: {
          id: activationId,
          licenseId: license.id,
          deviceIdHash,
          receiptHash: this.hash(receipt),
          lastSeenAt: now,
          hostnameEnc,
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

      let activation = await tx.activation.findUnique({
        where: { receiptHash },
        include: { license: true },
      });

      if (!activation && payload?.activation_id) {
        activation = await tx.activation.findUnique({
          where: { id: payload.activation_id },
          include: { license: true },
        });
      }

      if (!activation) {
        return {
          valid: false,
          reason: 'invalid_or_revoked',
          server_time: now.toISOString(),
        };
      }

      if (
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
        const modules = await this.buildReceiptModules(activation.license.id, activation.id);
        const refreshedReceipt = createReceipt({
          v: 1,
          license_id: activation.license.id,
          project_id: activation.license.projectId,
          activation_id: activation.id,
          device_id_hash: activation.deviceIdHash,
          plan: activation.license.plan,
          max_activations: activation.license.maxActivations,
          issued_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          grace_period_days: graceDays,
          modules,
        });
        await tx.activation.update({
          where: { id: activation.id },
          data: { lastSeenAt: now, receiptHash: this.hash(refreshedReceipt) },
        });
        return {
          valid: true,
          reason: 'grace_period',
          new_receipt: refreshedReceipt,
          expires_at: expiresAt.toISOString(),
          server_time: now.toISOString(),
        };
      }

      const modules = await this.buildReceiptModules(activation.license.id, activation.id);
      const refreshedReceipt = createReceipt({
        v: 1,
        license_id: activation.license.id,
        project_id: activation.license.projectId,
        activation_id: activation.id,
        device_id_hash: activation.deviceIdHash,
        plan: activation.license.plan,
        max_activations: activation.license.maxActivations,
        issued_at: now.toISOString(),
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        grace_period_days: payload?.grace_period_days ?? 14,
        modules,
      });
      await tx.activation.update({
        where: { id: activation.id },
        data: { lastSeenAt: now, receiptHash: this.hash(refreshedReceipt) },
      });
      return {
        valid: true,
        reason: legacyReceipt ? 'legacy_receipt' : undefined,
        new_receipt: refreshedReceipt,
        expires_at: expiresAt ? expiresAt.toISOString() : undefined,
        server_time: now.toISOString(),
      };
    });
  }

  async getActivationModules(licenseId: string, activationId: string): Promise<ActivationModulesResponseDto> {
    const activation = await this.prisma.activation.findFirst({
      where: { id: activationId, licenseId },
    });
    if (!activation) {
      throw new HttpException('activation_not_found', HttpStatus.NOT_FOUND);
    }

    const licenseModules = await this.prisma.licenseModule.findMany({
      where: { licenseId },
      include: { module: true },
    });
    const activationModules = await this.prisma.activationModule.findMany({
      where: { activationId },
      include: { module: true },
    });
    const activationMap = new Map(activationModules.map((item) => [item.moduleId, item]));
    const restrict = activation.modulesRestricted;

    const modules = licenseModules.map((item) => {
      const activationOverride = activationMap.get(item.moduleId);
      const enabled = item.forceDeactivation
        ? false
        : item.forceActivation
          ? true
          : restrict
            ? Boolean(activationOverride)
            : true;
      const params = this.mergeParams(item.module.params as Record<string, string> | null, item.params as Record<string, string> | null, activationOverride?.params as Record<string, string> | null);
      return {
        module_id: item.module.id,
        key: item.module.key,
        name: item.module.name,
        enabled,
        force_activation: item.forceActivation || undefined,
        force_deactivation: item.forceDeactivation || undefined,
        params: Object.keys(params).length ? params : undefined,
      };
    });

    return { modules };
  }

  async getLicenseModules(licenseId: string): Promise<LicenseModulesResponseDto> {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      select: { id: true, projectId: true },
    });
    if (!license) {
      throw new HttpException('license_not_found', HttpStatus.NOT_FOUND);
    }

    const projectModules = await this.prisma.projectModule.findMany({
      where: { projectId: license.projectId },
      orderBy: { createdAt: 'desc' },
    });
    const licenseModules = await this.prisma.licenseModule.findMany({
      where: { licenseId },
      include: { module: true },
    });
    const licenseMap = new Map(licenseModules.map((item) => [item.moduleId, item]));

    const modules = projectModules.map((module) => {
      const override = licenseMap.get(module.id);
      const enabled = Boolean(override) && !override?.forceDeactivation;
      const params = this.mergeParams(
        module.params as Record<string, string> | null,
        override?.params as Record<string, string> | null,
        null,
      );
      return {
        module_id: module.id,
        key: module.key,
        name: module.name,
        enabled,
        force_activation: override?.forceActivation || undefined,
        force_deactivation: override?.forceDeactivation || undefined,
        params: Object.keys(params).length ? params : undefined,
      };
    });

    return { modules };
  }

  async updateLicenseModules(
    licenseId: string,
    body: UpdateLicenseModulesRequestDto,
  ): Promise<LicenseModulesResponseDto> {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      select: { id: true, projectId: true },
    });
    if (!license) {
      throw new HttpException('license_not_found', HttpStatus.NOT_FOUND);
    }
    const normalizedModules = (body.modules ?? [])
      .map((item) => ({
        key: item.key.trim(),
        force_activation: Boolean(item.force_activation),
        force_deactivation: Boolean(item.force_deactivation),
      }))
      .filter((item) => item.key)
      .map((item) => {
        if (item.force_deactivation) {
          return { ...item, force_activation: false };
        }
        if (item.force_activation) {
          return { ...item, force_deactivation: false };
        }
        return item;
      });
    const uniqueKeys = Array.from(new Set(normalizedModules.map((item) => item.key)));
    const projectModules = await this.prisma.projectModule.findMany({
      where: { projectId: license.projectId, key: { in: uniqueKeys } },
    });
    if (projectModules.length !== uniqueKeys.length) {
      throw new HttpException('module_not_found', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.licenseModule.deleteMany({ where: { licenseId } });
    if (projectModules.length > 0) {
      const forceByKey = new Map(
        normalizedModules.map((item) => [item.key, { on: item.force_activation, off: item.force_deactivation }]),
      );
      await this.prisma.licenseModule.createMany({
        data: projectModules.map((module) => ({
          licenseId,
          moduleId: module.id,
          forceActivation: forceByKey.get(module.key)?.on ?? false,
          forceDeactivation: forceByKey.get(module.key)?.off ?? false,
        })),
      });
    }
    if (projectModules.length > 0) {
      await this.prisma.activationModule.deleteMany({
        where: { activation: { licenseId }, moduleId: { notIn: projectModules.map((m) => m.id) } },
      });
      const forcedOffIds = projectModules
        .filter((module) => {
          const settings = normalizedModules.find((item) => item.key === module.key);
          return settings?.force_deactivation;
        })
        .map((module) => module.id);
      if (forcedOffIds.length > 0) {
        await this.prisma.activationModule.deleteMany({
          where: { activation: { licenseId }, moduleId: { in: forcedOffIds } },
        });
      }
    } else {
      await this.prisma.activationModule.deleteMany({ where: { activation: { licenseId } } });
    }
    return this.getLicenseModules(licenseId);
  }

  async updateActivationModules(
    licenseId: string,
    activationId: string,
    body: UpdateActivationModulesRequestDto,
  ): Promise<ActivationModulesResponseDto> {
    const activation = await this.prisma.activation.findFirst({
      where: { id: activationId, licenseId },
    });
    if (!activation) {
      throw new HttpException('activation_not_found', HttpStatus.NOT_FOUND);
    }
    const moduleKeys = Array.from(new Set(body.module_keys.map((key) => key.trim()).filter(Boolean)));
    const licenseModules = await this.prisma.licenseModule.findMany({
      where: { licenseId },
      include: { module: true },
    });
    const licenseModuleIds = new Map(licenseModules.map((item) => [item.module.key, item.module.id]));
    const forcedOff = new Set(licenseModules.filter((item) => item.forceDeactivation).map((item) => item.module.key));
    const invalid = moduleKeys.filter((key) => !licenseModuleIds.has(key));
    if (invalid.length > 0) {
      throw new HttpException('module_not_allowed', HttpStatus.BAD_REQUEST);
    }
    const filteredKeys = moduleKeys.filter((key) => !forcedOff.has(key));
    await this.prisma.activationModule.deleteMany({ where: { activationId } });
    await this.prisma.activation.update({
      where: { id: activationId },
      data: { modulesRestricted: true },
    });
    if (filteredKeys.length > 0) {
      await this.prisma.activationModule.createMany({
        data: filteredKeys.map((key) => ({
          activationId,
          moduleId: licenseModuleIds.get(key) as string,
        })),
      });
    }
    const refreshed = await this.prisma.activation.findUnique({
      where: { id: activationId },
      include: { license: true },
    });
    if (!refreshed) {
      throw new HttpException('activation_not_found', HttpStatus.NOT_FOUND);
    }
    const modules = await this.buildReceiptModules(refreshed.license.id, refreshed.id);
    const refreshedReceipt = createReceipt({
      v: 1,
      license_id: refreshed.license.id,
      project_id: refreshed.license.projectId,
      activation_id: refreshed.id,
      device_id_hash: refreshed.deviceIdHash,
      plan: refreshed.license.plan,
      max_activations: refreshed.license.maxActivations,
      issued_at: new Date().toISOString(),
      expires_at: refreshed.license.expiresAt ? refreshed.license.expiresAt.toISOString() : null,
      grace_period_days: refreshed.license.gracePeriodDays ?? 14,
      modules,
    });
    await this.prisma.activation.update({
      where: { id: refreshed.id },
      data: { receiptHash: this.hash(refreshedReceipt) },
    });
    const response = await this.getActivationModules(licenseId, activationId);
    return { ...response, new_receipt: refreshedReceipt };
  }

  async revealActivationHostname(licenseId: string, activationId: string): Promise<{ hostname?: string }> {
    const activation = await this.prisma.activation.findFirst({
      where: { id: activationId, licenseId },
    });
    if (!activation || !activation.hostnameEnc) {
      return {};
    }
    const hostname = decryptData(activation.hostnameEnc, this.getDataKey());
    return { hostname };
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
