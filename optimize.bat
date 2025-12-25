@echo off
REM WayTree Backend Optimization Script
REM Optimizes the Node.js/TypeScript backend for better performance

echo ===============================================================
echo    WayTree Backend Optimization
echo ===============================================================
echo.

echo [STEP 1] Cleaning node_modules and build cache...
if exist node_modules rmdir /s /q node_modules
if exist dist rmdir /s /q dist
echo.

echo [STEP 2] Installing dependencies (optimized)...
npm install --production=false
echo.

echo [STEP 3] Auditing dependencies for vulnerabilities...
npm audit
echo.

echo [STEP 4] Checking for outdated packages...
npm outdated
echo.

echo [STEP 5] Running TypeScript type check...
npm run type-check
echo.

echo [STEP 6] Running ESLint...
npm run lint
echo.

echo [STEP 7] Building optimized production bundle...
npm run build
echo.

echo ===============================================================
echo    Optimization Complete!
echo ===============================================================
echo.
echo Next steps:
echo   1. Review the audit output above
echo   2. Fix any security vulnerabilities
echo   3. Update outdated packages if needed
echo   4. Run: npm run dev (development)
echo   5. Or: npm start (production)
echo.
echo ===============================================================
