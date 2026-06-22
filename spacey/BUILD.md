# Build instructions for SpaceY

## Windows Build with Visual Studio

### 1. Install vcpkg
```bash
git clone https://github.com/Microsoft/vcpkg.git
cd vcpkg
bootstrap-vcpkg.bat
vcpkg integrate install
```

### 2. Install dependencies
```bash
vcpkg install curl:x64-windows
vcpkg install nlohmann-json:x64-windows
vcpkg install qt6-base:x64-windows
```

### 3. Configure and build
```bash
cd spacey
mkdir build
cd build
cmake .. -DCMAKE_TOOLCHAIN_FILE=C:/path/to/vcpkg/scripts/buildsystems/vcpkg.cmake -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

### 4. Run
```bash
set SPACEY_API_KEY=your-api-key
.\Release\SpaceY.exe
```

## MinGW-w64 Build

### 1. Install MinGW-w64
Download from: https://github.com/niXman/mingw-builds-binaries/releases

### 2. Install dependencies with vcpkg
```bash
vcpkg install curl:x64-mingw-static
vcpkg install nlohmann-json:x64-mingw-static
vcpkg install qt6-base:x64-mingw-static
```

### 3. Build
```bash
mkdir build && cd build
cmake .. -G "MinGW Makefiles" -DCMAKE_TOOLCHAIN_FILE=C:/path/to/vcpkg/scripts/buildsystems/vcpkg.cmake
mingw32-make -j8
```

## Dependencies

- **libcurl** - HTTP client for API requests
- **nlohmann/json** - JSON parsing and generation
- **Qt6** (optional) - GUI framework
  - If Qt6 not available, set `-DUSE_QT=OFF` for console-only build

## Troubleshooting

### CURL SSL errors
If you get SSL certificate errors:
```bash
vcpkg install curl[ssl]:x64-windows
```

### Qt6 not found
Make sure Qt6 is in CMAKE_PREFIX_PATH:
```bash
set CMAKE_PREFIX_PATH=C:/Qt/6.5.0/msvc2019_64
```

### Missing DLLs at runtime
Copy Qt DLLs to output directory or use `windeployqt`:
```bash
windeployqt .\Release\SpaceY.exe
```
