// config.mjs — Server configuration from environment

function env(key) {
  return process.env[key];
}

function requireEnv(key, minLength = 0) {
  const value = env(key);
  if (!value) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
  if (minLength && value.length < minLength) {
    console.error(`${key} must be at least ${minLength} characters`);
    process.exit(1);
  }
  return value;
}

export const config = {
  databaseUrl: requireEnv('DATABASE_URL'),
  adminToken: requireEnv('FLEEET_ADMIN_TOKEN', 32),
  port: parseInt(env('PORT') || '3000', 10),
  publicUrl: env('FLEEET_PUBLIC_URL') || `http://localhost:${env('PORT') || 3000}`,
};

export const version = '0.1.0';
