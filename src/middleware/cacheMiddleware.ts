/**
 * Caching Middleware for Express Routes
 * Automatically caches GET request responses
 */

import { Request, Response, NextFunction } from 'express';
const cacheServiceModule = require('../services/cacheService');
const cacheService = cacheServiceModule.default || cacheServiceModule;
const { CacheTTL } = cacheServiceModule;

/**
 * Cache middleware factory
 * @param {number} ttl - Time to live in milliseconds
 * @param {function} keyGenerator - Optional custom key generator
 */
export const cacheMiddleware = (ttl: number = CacheTTL.MEDIUM, keyGenerator: ((req: Request) => string) | null = null) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        // Generate cache key
        const cacheKey = keyGenerator
            ? keyGenerator(req)
            : `route:${req.originalUrl}:${(req as any).user?.id || 'anonymous'}`;

        // Try to get from cache
        const cachedResponse = cacheService.get(cacheKey);

        if (cachedResponse) {
            console.log(`⚡ [CACHE] Serving cached response for: ${req.originalUrl}`);
            return res.json(cachedResponse);
        }

        // Store original res.json
        const originalJson = res.json.bind(res);

        // Override res.json to cache the response
        res.json = (body: any) => {
            // Cache the response
            cacheService.set(cacheKey, body, ttl);
            console.log(`💾 [CACHE] Cached response for: ${req.originalUrl}`);

            // Send the response
            return originalJson(body);
        };

        next();
    };
};

/**
 * Clear cache for specific patterns
 */
export const clearCache = (pattern?: string) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        const patternToUse = pattern || `route:${req.baseUrl}`;
        cacheService.clearPattern(patternToUse);
        next();
    };
};

/**
 * Cache invalidation middleware for mutations
 * Automatically clears cache on POST/PUT/DELETE
 */
export const invalidateCache = (pattern?: string) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        // Only invalidate on mutations
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            const patternToUse = pattern || `route:${req.baseUrl}`;
            cacheService.clearPattern(patternToUse);
            console.log(`🗑️ [CACHE] Invalidated cache for pattern: ${patternToUse}`);
        }
        next();
    };
};
