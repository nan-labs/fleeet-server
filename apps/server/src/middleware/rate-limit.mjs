// middleware/rate-limit.mjs — Simple in-memory rate limiter

const windows = new Map();

function cleanOld(now, windowMs) {
  const cutoff = now - windowMs;
  for (const [key, data] of windows.entries()) {
    if (data.resetAt < cutoff) {
      windows.delete(key);
    }
  }
}

export function rateLimit({ maxRequests = 100, windowMs = 60000, keyBy = 'ip' } = {}) {
  return async (c, next) => {
    const now = Date.now();
    cleanOld(now, windowMs * 2);

    let key;
    if (keyBy === 'ip') {
      key = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 
            c.req.header('x-real-ip') || 
            'unknown';
    } else if (keyBy === 'accountId') {
      key = c.get('accountId') || 'unauthenticated';
    } else {
      key = 'global';
    }

    const windowKey = `${key}:${Math.floor(now / windowMs)}`;
    const data = windows.get(windowKey) || { count: 0, resetAt: now + windowMs };
    
    if (data.count >= maxRequests) {
      return c.json(
        { 
          error: 'Rate limit exceeded', 
          retryAfter: Math.ceil((data.resetAt - now) / 1000) 
        }, 
        429
      );
    }

    data.count++;
    windows.set(windowKey, data);

    c.header('X-RateLimit-Limit', maxRequests.toString());
    c.header('X-RateLimit-Remaining', (maxRequests - data.count).toString());
    c.header('X-RateLimit-Reset', Math.ceil(data.resetAt / 1000).toString());

    await next();
  };
}
