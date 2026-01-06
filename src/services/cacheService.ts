/**
 * Cache Service for WayTree App Backend
 * Provides in-memory caching with TTL support
 */

class CacheService {
    private cache: Map<string, any>;
    private expiryTimes: Map<string, number>;
    private defaultTTL: number;

    constructor() {
        this.cache = new Map();
        this.expiryTimes = new Map();
        this.defaultTTL = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Generate cache key
     */
    generateKey(prefix: string, identifier: string): string {
        return `${prefix}:${identifier}`;
    }

    /**
     * Set value in cache
     */
    set(key: string, value: any, ttl: number = this.defaultTTL): boolean {
        this.cache.set(key, value);
        this.expiryTimes.set(key, Date.now() + ttl);
        console.log(`💾 [CACHE] Stored: ${key} (TTL: ${ttl}ms)`);
        return true;
    }

    /**
     * Get value from cache
     */
    get(key: string): any {
        const expiry = this.expiryTimes.get(key);

        if (!expiry || Date.now() > expiry) {
            this.delete(key);
            console.log(`❌ [CACHE] Miss: ${key}`);
            return null;
        }

        console.log(`✅ [CACHE] Hit: ${key}`);
        return this.cache.get(key);
    }

    /**
     * Delete cache entry
     */
    delete(key: string): boolean {
        this.cache.delete(key);
        this.expiryTimes.delete(key);
        return true;
    }

    /**
     * Clear all cache
     */
    clear(): boolean {
        this.cache.clear();
        this.expiryTimes.clear();
        console.log('🗑️ [CACHE] Cleared all entries');
        return true;
    }

    /**
     * Clear cache by pattern
     */
    clearPattern(pattern: string): number {
        const regex = new RegExp(pattern);
        let cleared = 0;

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.delete(key);
                cleared++;
            }
        }

        console.log(`🗑️ [CACHE] Cleared ${cleared} entries matching: ${pattern}`);
        return cleared;
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }

    /**
     * Clean expired entries (run periodically)
     */
    cleanExpired(): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, expiry] of this.expiryTimes.entries()) {
            if (now > expiry) {
                this.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 [CACHE] Cleaned ${cleaned} expired entries`);
        }

        return cleaned;
    }
}

// Create singleton instance
const cacheService = new CacheService();

// Clean expired entries every 10 minutes
setInterval(() => {
    cacheService.cleanExpired();
}, 10 * 60 * 1000);

export default cacheService;

// Cache TTL presets
export const CacheTTL = {
    SHORT: 1 * 60 * 1000,      // 1 minute
    MEDIUM: 5 * 60 * 1000,     // 5 minutes
    LONG: 15 * 60 * 1000,      // 15 minutes
    VERY_LONG: 60 * 60 * 1000, // 1 hour
    STATIC: 24 * 60 * 60 * 1000 // 24 hours
};
