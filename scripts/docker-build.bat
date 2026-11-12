@echo off
REM Build and test the Docker image (Windows)

echo 🐳 Building CodeYang Docker image...
docker build -t codeyang:latest .

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Build failed!
    exit /b 1
)

echo.
echo ✅ Build successful!
echo.
echo 📦 Image size:
docker images codeyang:latest

echo.
echo 🧪 Testing the image...
docker run --rm codeyang:latest --version

echo.
echo ✨ Docker image is ready!
echo.
echo Usage:
echo   docker run -it -e CODEYANG_API_KEY=%%API_KEY%% codeyang:latest
echo   or
echo   docker-compose up -d
