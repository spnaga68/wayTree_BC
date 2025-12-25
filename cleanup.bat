@echo off
REM WayTree Backend Cleanup Script
REM Removes unwanted documentation and test files

echo ===============================================================
echo    WayTree Backend Cleanup
echo ===============================================================
echo.

echo [CLEANUP] Removing unwanted documentation files...
echo.

REM Remove documentation MD files (keep only README.md)
del /Q "API-REFERENCE.md" 2>nul
del /Q "AUTH-POSTMAN-GUIDE.md" 2>nul
del /Q "COMPLETE-AUTH-SOLUTION.md" 2>nul
del /Q "DEV-PROD-MODE.md" 2>nul
del /Q "DOCUMENTS-API-GUIDE.md" 2>nul
del /Q "FLOW-DIAGRAMS.md" 2>nul
del /Q "GMAIL-SETUP.md" 2>nul
del /Q "INDEX.md" 2>nul
del /Q "MOBILE-API-GUIDE.md" 2>nul
del /Q "POSTMAN-SETUP.md" 2>nul
del /Q "QR-CODE-CONFIG.md" 2>nul
del /Q "QUICK-START-AUTH.md" 2>nul
del /Q "QUICKSTART.md" 2>nul
del /Q "README-AUTH-API.md" 2>nul
del /Q "SETUP-COMPLETE.md" 2>nul
del /Q "SOLUTION-COMPLETE.md" 2>nul
del /Q "SOLUTION-SUMMARY.md" 2>nul

echo [CLEANUP] Removing test and debug files...
del /Q "API-SUMMARY.txt" 2>nul
del /Q "DEBUG-LOGGING-SETUP.txt" 2>nul
del /Q "debug_otp_output.txt" 2>nul
del /Q "FINAL-SUMMARY.txt" 2>nul
del /Q "EXTENDED-FEATURES.txt" 2>nul
del /Q "EMAIL-SETUP-COMPLETE.txt" 2>nul
del /Q "MOBILE-FIX-DOCUMENTS.txt" 2>nul
del /Q "GMAIL-TROUBLESHOOT.txt" 2>nul
del /Q "START-HERE.txt" 2>nul

echo [CLEANUP] Removing HTTP test files...
del /Q "api-tests.http" 2>nul
del /Q "devtunnel-test.http" 2>nul
del /Q "extended-api-tests.http" 2>nul
del /Q "quick-test.http" 2>nul
del /Q "test-debug-mode.http" 2>nul

echo [CLEANUP] Removing Postman collections...
del /Q "Auth-API.postman_collection.json" 2>nul
del /Q "Connection-API.postman_collection.json" 2>nul
del /Q "GoalNet-API.postman_collection.json" 2>nul
del /Q "NetworkCode-API.postman_collection.json" 2>nul
del /Q "API-SPEC.json" 2>nul

echo [CLEANUP] Removing shell scripts...
del /Q "start-dev.sh" 2>nul
del /Q "test-api.sh" 2>nul

echo [CLEANUP] Removing debug files from src...
del /Q "src\debug_otp.ts" 2>nul
del /Q "src\debug_otp_v2.ts" 2>nul
del /Q "src\models.zip" 2>nul

echo.
echo [SUCCESS] Cleanup complete!
echo.
echo Kept files:
echo   - README.md (main documentation)
echo   - .env (environment config)
echo   - .env.example (environment template)
echo   - package.json (dependencies)
echo   - tsconfig.json (TypeScript config)
echo   - src/ (source code)
echo.
echo ===============================================================
