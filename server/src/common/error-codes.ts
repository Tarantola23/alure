export const ERROR_CODE_MAP: Record<string, number> = {
  // Auth (1xxx)
  admin_only: 1001,
  admin_exists: 1002,
  user_exists: 1003,
  user_not_found: 1004,
  invalid_invite: 1005,
  invite_expired: 1006,
  invalid_otp: 1007,
  auth_required: 1008,
  invalid_password: 1009,
  missing_user: 1010,

  // Licensing (2xxx)
  license_not_found: 2001,
  license_revoked: 2002,
  license_expired: 2003,
  activation_already_exists: 2004,
  activation_limit_reached: 2005,
  activation_not_found: 2006,
  recipients_required: 2007,
  module_not_found: 2008,
  module_not_allowed: 2009,

  // Releases & Updates (3xxx)
  release_not_found: 3001,
  release_version_exists: 3002,
  channel_required: 3003,
  invalid_channel: 3004,
  invalid_release: 3005,
  file_required: 3006,
  asset_not_found: 3007,
  asset_project_mismatch: 3008,
  license_invalid: 3009,
  invalid_token: 3010,
  missing_token: 3011,

  // SMTP (4xxx)
  smtp_not_verified: 4001,
  smtp_not_configured: 4002,
  missing_password: 4003,
  missing_verification_code: 4004,
  verification_code_expired: 4005,
  invalid_verification_code: 4006,

  // Projects & Modules (5xxx)
  project_not_found: 5001,
  project_name_already_exists: 5002,
  module_key_exists: 5003,

  // Plans (6xxx)
  plan_not_found: 6001,
  plan_name_already_exists: 6002,
};

export const resolveErrorCode = (message?: string): number | undefined => {
  if (!message) return undefined;
  return ERROR_CODE_MAP[message];
};
