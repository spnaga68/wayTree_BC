/**
 * Caching Middleware for Express Routes
 * Automatically caches GET request responses using Redis (if available) or Memory
 */

import { Request, Response, NextFunction } from 'express';
import cacheService, { CacheTTL } from '../services/cacheService';

/**
 * Cache middleware factory
 * @param {number} ttl - Time to live in milliseconds
 * @param {function} keyGenerator - Optional custom key generator
 */
export const cacheMiddleware = (ttl: number = CacheTTL.MEDIUM, keyGenerator: ((req: Request) => string) | null = null) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // Express 4 Async Wrapper
        (async () => {
            // Only cache GET requests
            if (req.method !== 'GET') {
                return next();
            }

            // Check for bypass (nocache)
            const bypassCache = req.query.nocache === 'true' || req.headers['x-force-refresh'] === 'true';

            // Generate cache key (remove nocache param to share key with normal requests)
            let urlForKey = req.originalUrl.replace(/[?&]nocache=true/, '');
            if (urlForKey.endsWith('?') || urlForKey.endsWith('&')) {
                urlForKey = urlForKey.slice(0, -1);
            }

            const cacheKey = keyGenerator
                ? keyGenerator(req)
                : `route:${urlForKey}:${(req as any).user?.id || 'anonymous'}`;

            // Try to get from cache (unless bypassed)
            let cachedResponse: any = null;
            if (!bypassCache) {
                cachedResponse = await cacheService.get(cacheKey);
            }

            if (bypassCache) {
                console.log(`🔃 [CACHE] Bypassing (Force Refresh) for: ${urlForKey}`);
            } else if (cachedResponse) {
                console.log(`⚡ [CACHE] Serving cached response for: ${urlForKey}`);
                return res.json(cachedResponse);
            }

            // Store original res.json
            const originalJson = res.json.bind(res);

            // Override res.json to cache the response
            res.json = (body: any) => {
                // Cache the response (Async fire & forget)
                cacheService.set(cacheKey, body, ttl).catch(err => {
                    console.error('❌ [CACHE] Set Error:', err);
                });

                if (bypassCache) {
                    console.log(`💾 [CACHE] Refreshed cache for: ${urlForKey}`);
                }

                // Send the response
                return originalJson(body);
            };

            next();
        })().catch(next);
    };
};

/**
 * Clear cache for specific patterns (Middleware)
 */
export const clearCache = (pattern?: string) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        (async () => {
            const patternToUse = pattern || `route:${req.baseUrl}`;
            await cacheService.clearPattern(patternToUse);
            next();
        })().catch(next);
    };
};

/**
 * Alias for clearCache
 */
export const invalidateCache = clearCache;

export { CacheTTL };
