# CUI 调用方式学习总结

**项目**: CUI - 一个 C99 的即时模式 UI 库  
**来源**: https://github.com/yappologistic/CUI  
**语言**: C99  

---

## 🎯 核心概念：即时模式 (Immediate Mode)

### 传统方式 vs 即时模式

**传统方式（保留模式）**:
```c
// 创建控件一次，保持指针
Button* btn = create_button("Click me");
// 后续查询状态
if (btn->clicked) { ... }
```

**即时模式（CUI）**:
```c
// 每帧都调用，返回当前状态
if (cui_button(ui, "Click me")) {
    // 立即处理点击
}
```

---

## 📋 基本调用模式

### 1. 最小示例（hello.c）

```c
#include <cui/cui.h>
#include <cui/cui_app.h>

int main(void) {
    // 1. 创建应用窗口
    cui_app *app = cui_app_create(&(cui_app_desc){
        .title = "Hello",
        .width = 420,
        .height = 300
    });
    if (!app) return 1;
    
    // 2. 应用状态（在循环外定义，保持状态）
    bool notifications = true;
    int clicks = 0;
    
    // 3. 主循环：每帧重新描述整个界面
    while (cui_app_frame(app)) {
        cui_ctx *ui = cui_app_ui(app);
        
        // 4. 布局容器
        cui_column(ui, .pad = 32, .gap = 16, .width = CUI_FILL) {
            // 5. UI 组件（每帧都调用）
            cui_heading(ui, "Hello, CUI", 2);
            cui_secondary(ui, "A native window, a few components.");
            
            // 6. 交互组件返回状态
            cui_switch(ui, "Notifications", &notifications);
            
            cui_row(ui, .gap = 8) {
                if (cui_button(ui, "Click me", .variant = CUI_BUTTON_PRIMARY)) {
                    clicks++;  // 点击时立即处理
                }
                cui_textf(ui, "Clicked %d times", clicks);
            }
        }
    }
    
    // 7. 清理
    cui_app_destroy(app);
    return 0;
}
```

---

## 🔑 关键调用模式

### 1. 应用生命周期

```c
// 创建应用
cui_app *app = cui_app_create(&(cui_app_desc){
    .title = "My App",
    .width = 900,
    .height = 600
});

// 主循环
while (cui_app_frame(app)) {
    cui_ctx *ui = cui_app_ui(app);
    // 描述 UI...
}

// 清理
cui_app_destroy(app);
```

**或者使用回调模式**:

```c
static void frame(cui_ctx *ui, void *user) {
    // 描述 UI...
}

int main(void) {
    return cui_app_run(&(cui_app_desc){ .title = "My App" }, frame, NULL);
}
```

---

### 2. 布局容器

```c
// 垂直布局
cui_column(ui, .pad = 24, .gap = 12, .width = CUI_FILL) {
    // 子组件...
}

// 水平布局
cui_row(ui, .gap = 8, .align = CUI_ALIGN_CENTER) {
    // 子组件...
}

// 栈布局（重叠）
cui_stack(ui, .width = CUI_FILL, .height = CUI_FILL) {
    // 层级组件...
}

// 自定义盒子
cui_box(ui, .width = CUI_PX(200), .height = CUI_PX(100), .bg = CUI_COLOR_SURFACE) {
    // 内容...
}
```

---

### 3. 常用组件

```c
// 文本
cui_heading(ui, "Title", 2);
cui_text(ui, "Normal text");
cui_secondary(ui, "Secondary text");
cui_textf(ui, "Formatted: %d", value);

// 按钮
if (cui_button(ui, "Click me", .variant = CUI_BUTTON_PRIMARY)) {
    // 处理点击
}

if (cui_icon_button(ui, CUI_ICON_SETTINGS, .tooltip = "Settings")) {
    // 处理点击
}

// 输入控件
cui_switch(ui, "Enable", &enabled);
cui_checkbox(ui, "Option", &checked);
cui_slider(ui, "Volume", &volume, 0, 100);
cui_input(ui, "Name", buffer, sizeof(buffer));

// 选择器
if (cui_select(ui, "Theme", &theme_index)) {
    cui_select_option(ui, "Light");
    cui_select_option(ui, "Dark");
    cui_select_option(ui, "Auto");
}

// 导航
if (cui_nav_item(ui, "Dashboard", .icon = CUI_ICON_HOME, .selected = page == 0)) {
    page = 0;
}

// 卡片
cui_card(ui, .pad = 16, .gap = 12) {
    // 卡片内容...
}

// 进度条
cui_progress(ui, progress, .height = 8);

// 图标
cui_icon(ui, CUI_ICON_CHECK, 16, CUI_COLOR_SUCCESS);
```

---

### 4. 复杂示例：助手应用（assistant.c）

```c
typedef struct {
    int chat;
    char draft[2048];
    int model;
    double started;
    bool narrow;
    bool drawer;
} app_state;

static void sidebar(cui_ctx *ui, app_state *s, bool drawer) {
    cui_column(ui, .width = drawer ? CUI_FILL : CUI_PX(264), .height = CUI_FILL) {
        // 头部
        cui_row(ui, .gap = 10, .align = CUI_ALIGN_CENTER) {
            cui_text(ui, "Muse", .font = CUI_FONT_MEDIUM);
            if (cui_icon_button(ui, CUI_ICON_SQUARE_PEN, .tooltip = "New chat")) {
                s->asked_once = false;
            }
        }
        
        // 导航列表
        cui_nav_section(ui, "Today");
        for (int i = 0; i < 3; i++) {
            if (cui_nav_item(ui, items[i], .icon = CUI_ICON_MESSAGE_SQUARE, 
                           .selected = s->chat == i)) {
                s->chat = i;
            }
        }
        
        // 进度卡片
        cui_card(ui, .pad = 14, .gap = 8) {
            cui_progress(ui, 0.42f, .height = 6);
            cui_text(ui, "4,210 of 10,000 messages");
        }
        
        // 用户菜单
        cui_user_menu(ui, "User Name", .detail = "email@example.com") {
            cui_menu_item(ui, "Settings", .icon = CUI_ICON_SETTINGS);
            cui_menu_item(ui, "Log out", .icon = CUI_ICON_LOG_OUT);
        }
    }
}
```

---

## 🎨 样式和主题

```c
// 颜色
.bg = CUI_COLOR_SURFACE
.bg = CUI_COLOR_ACCENT
.color = CUI_COLOR_TEXT_SECONDARY

// 尺寸
.width = CUI_FILL           // 填充父容器
.width = CUI_PX(200)        // 固定像素
.height = CUI_PERCENT(50)   // 百分比

// 间距
.pad = 24                   // 所有方向
.pad_x = 16                 // 水平
.pad_y = 12                 // 垂直
.gap = 8                    // 子元素间距

// 对齐
.align = CUI_ALIGN_CENTER   // 交叉轴
.justify = CUI_JUSTIFY_END  // 主轴

// 圆角
.radius = 8
```

---

## 💡 核心原则

### 1. 每帧重建
```c
while (cui_app_frame(app)) {
    // 整个 UI 树每帧都重新描述
    // CUI 自动处理差异和重绘
}
```

### 2. 状态在循环外
```c
// ✅ 正确：状态在循环外
static int count = 0;
while (cui_app_frame(app)) {
    if (cui_button(ui, "Increment")) count++;
}

// ❌ 错误：状态在循环内会被重置
while (cui_app_frame(app)) {
    int count = 0;  // 每帧重置！
}
```

### 3. 立即响应
```c
// 事件处理是立即的，不需要回调
if (cui_button(ui, "Save")) {
    save_data();  // 立即执行
}
```

### 4. ID 管理
```c
// 相同文本的多个组件需要唯一 ID
for (int i = 0; i < count; i++) {
    cui_push_id(ui, &items[i]);  // 使用指针作为 ID
    if (cui_button(ui, "Delete")) {
        delete_item(i);
    }
    cui_pop_id(ui);
}
```

---

## 🔧 构建方式

### 使用 CMake（推荐）

```cmake
cmake_minimum_required(VERSION 3.14)
project(my_app C)

add_subdirectory(CUI)
add_executable(my_app main.c)
target_link_libraries(my_app PRIVATE cui::cui)
cui_app_target(my_app)
```

### 直接编译

```bash
# Linux
cc -std=c99 -O2 -Iinclude main.c src/*.c src/render/*.c \
   src/platform/cui_app.c src/platform/cui_dialogs.c \
   src/platform/cui_app_x11.c \
   -lX11 -ldl -lm -lpthread -o my_app

# Windows (MinGW)
gcc -std=c99 -O2 -Iinclude main.c src/*.c src/render/*.c \
    src/platform/cui_app.c src/platform/cui_dialogs.c \
    src/platform/cui_app_win32.c \
    -luser32 -lgdi32 -lopengl32 -lshell32 -limm32 -ldwmapi \
    -lcomdlg32 -lole32 -o my_app.exe
```

---

## 📊 特点

### 优势
- ✅ **简单**: 无需管理控件生命周期
- ✅ **直观**: 代码即界面，一目了然
- ✅ **快速**: 每帧工作量少，响应迅速
- ✅ **小巧**: MinSizeRel 构建约 250 KB
- ✅ **无依赖**: 纯 C99，自带渲染器
- ✅ **跨平台**: Win32, Cocoa, X11, SDL2, GLFW

### 组件丰富
- 210+ 个内置组件
- 文本、按钮、输入、选择器
- 导航、菜单、对话框
- 图表、进度、徽章
- 布局、卡片、工具栏

---

## 🎯 适用场景

- ✅ 工具和实用程序
- ✅ 开发者工具
- ✅ 数据可视化
- ✅ 游戏编辑器
- ✅ 原型和演示

---

## 📚 关键文档

- `docs/getting-started.md` - 快速入门
- `docs/tutorial.md` - 完整教程
- `docs/components.md` - 组件参考
- `docs/architecture.md` - 架构说明
- `CLAUDE.md` - AI Agent 指南

---

**总结**: CUI 是一个现代的即时模式 UI 库，核心思想是"每帧描述界面"，代码简洁直观，适合快速开发原生桌面应用。
