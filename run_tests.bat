@echo off
title WAREBOT Automated Test Suite
echo ============================================================
echo           RUNNING WAREBOT AUTOMATED TESTS
echo ============================================================
echo.
echo [1/2] Running Backend Unit and Integration Tests (pytest)...
python -m pytest backend/tests -v
if %ERRORLEVEL% neq 0 (
    echo.
    echo Backend tests failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Running Frontend & PWA Verification Tests (node)...
node frontend/test_pwa_and_frontend.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo Frontend tests failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ============================================================
echo         ALL WAREBOT TESTS PASSED SUCCESSFULLY!
echo ============================================================
pause
