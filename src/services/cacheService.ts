import { createClient, RedisClientType } from 'redis';

class CacheService {
    private client: RedisClientType | undefined;
    private isRedisConnected: boolean = false;
    private memoryCache: Map<string, { value: any, expiry: number }> = new Map();
    private defaultTTL: number = 300 * 1000; // 5 min default (ms)

    constructor() {
        if (process.env.REDIS_URL || process.env.NODE_ENV !== 'test') {
            const url = process.env.REDIS_URL || 'redis://localhost:6379';
            // Create client (v4)
            this.client = createClient({ url });

            this.client.on('error', (err) => {
                // Suppress connection refused logs if not running
                if (err.code !== 'ECONNREFUSED') {
                    console.error('❌ Redis Client Error:', err.message);
                }
                this.isRedisConnected = false;
            });

            this.client.on('connect', () => {
                console.log('✅ Redis Connected');
                this.isRedisConnected = true;
            });

            this.client.connect().catch(() => {
                console.warn('⚠️ Redis Connection Failed, falling back to Memory Cache');
                this.isRedisConnected = false;
            });
        }
    }

    // Wrap redis connection check
    private get useRedis() {
        return this.isRedisConnected && this.client && this.client.isOpen;
    }

    async get(key: string): Promise<any> {
        if (this.useRedis) {
            try {
                const val = await this.client!.get(key);
                return val ? JSON.parse(val) : null;
            } catch (e) {
                console.error('Redis Get Error:', e);
            }
        }

        // Memory fallback
        const item = this.memoryCache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            this.memoryCache.delete(key);
            return null;
        }
        return item.value;
    }

    async set(key: string, value: any, ttlMs: number = this.defaultTTL): Promise<void> {
        if (this.useRedis) {
            try {
                // Redis uses seconds for EX, or PX for milliseconds
                await this.client!.set(key, JSON.stringify(value), { PX: ttlMs });
                return;
            } catch (e) {
                console.error('Redis Set Error:', e);
            }
        }

        // Memory fallback
        this.memoryCache.set(key, {
            value,
            expiry: Date.now() + ttlMs
        });
    }

    async delete(key: string): Promise<void> {
        if (this.useRedis) {
            try {
                await this.client!.del(key);
                return;
            } catch (e) { console.error(e); }
        }
        this.memoryCache.delete(key);
    }

    async clearPattern(pattern: string): Promise<void> {
        // Pattern logic: Redis uses glob usually. Input might be Regex or Glob.
        // We'll normalize to Glob for Redis: replace .* with *
        const globPattern = pattern.replace(/\.\*/g, '*');

        if (this.useRedis) {
            try {
                // Use scanIterator for Type-Safe Iteration (Fixes TS cursor errors)
                const iterator = this.client!.scanIterator({
                    MATCH: globPattern,
                    COUNT: 100
                });

                for await (const key of iterator) {
                    await this.client!.del(key);
                }
            } catch (e) { console.error('Redis Scan Error:', e); }
        }

        // Always clear memory cache too (hybrid safety)
        const regex = new RegExp(pattern);
        for (const key of this.memoryCache.keys()) {
            if (regex.test(key)) {
                this.memoryCache.delete(key);
            }
        }
        console.log(`🗑️ [CACHE] Cleared pattern: ${pattern}`);
    }

    async clearUser(userId: string): Promise<void> {
        // Clear all keys ending with userId 
        // Middleware key: `route:URL:UserId`
        await this.clearPattern(`*:${userId}`);
    }

    // Invalidate All Events (Approvals, Updates)
    async invalidateEventLists(): Promise<void> {
        // Invalidate route:/events* (Global lists, pending, upcoming)
        await this.clearPattern('route:/events*');
    }
}

export const CacheTTL = {
    SHORT: 1 * 60 * 1000,      // 1 minute
    MEDIUM: 5 * 60 * 1000,     // 5 minutes
    LONG: 15 * 60 * 1000,      // 15 minutes
    VERY_LONG: 60 * 60 * 1000, // 1 hour
    STATIC: 24 * 60 * 60 * 1000 // 24 hours
};

export default new CacheService();
