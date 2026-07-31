process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/secure_service_desk_test';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.CORS_ORIGINS = 'http://localhost:3001';
process.env.ALLOW_ADMIN_BOOTSTRAP = 'false';

delete process.env.BOOTSTRAP_ADMIN_EMAIL;
delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
delete process.env.JWT_PRIVATE_KEY_BASE64;
delete process.env.JWT_PUBLIC_KEY_BASE64;
