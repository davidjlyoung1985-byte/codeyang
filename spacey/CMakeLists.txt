cmake_minimum_required(VERSION 3.20)
project(SpaceY VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Qt6 or Win32 option
option(USE_QT "Use Qt6 for UI (otherwise Win32)" ON)

# Find packages
if(USE_QT)
    find_package(Qt6 REQUIRED COMPONENTS Core Widgets)
endif()

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)
include_directories(${CMAKE_SOURCE_DIR}/third_party)

# Source files
set(AGENT_SOURCES
    src/agent/Agent.cpp
    src/agent/LLMClient.cpp
    src/agent/MessageHistory.cpp
)

set(TOOLS_SOURCES
    src/tools/ToolRegistry.cpp
    src/tools/FileTool.cpp
    src/tools/ShellTool.cpp
    src/tools/SearchTool.cpp
    src/tools/GitTool.cpp
)

set(UTILS_SOURCES
    src/utils/Config.cpp
    src/utils/Logger.cpp
    src/utils/AsyncExecutor.cpp
)

set(UI_SOURCES
    src/ui/MainWindow.cpp
    src/ui/ChatView.cpp
)

# Main executable
add_executable(SpaceY
    src/main.cpp
    ${AGENT_SOURCES}
    ${TOOLS_SOURCES}
    ${UTILS_SOURCES}
    ${UI_SOURCES}
)

# Link libraries
if(USE_QT)
    target_link_libraries(SpaceY PRIVATE Qt6::Core Qt6::Widgets)
endif()

# Windows specific
if(WIN32)
    target_link_libraries(SpaceY PRIVATE ws2_32 crypt32)
    # Add Windows subsystem for GUI app
    set_target_properties(SpaceY PROPERTIES WIN32_EXECUTABLE ON)
endif()

# Install
install(TARGETS SpaceY DESTINATION bin)
