// CodeYang AI - WPS JS宏加载项
// 安装: WPS → 开发工具 → JS宏 → 导入 → 选择此文件
// 使用: 运行 "CodeYangAI" 宏即可打开侧边栏

(function() {
    var PANEL_URL = "http://localhost:3456/wps";
    var panel = null;
    var isOpen = false;

    // 创建侧边栏面板
    function createPanel() {
        if (isOpen) {
            MsgBox("CodeYang 面板已打开", 0, "CodeYang");
            return;
        }

        try {
            // WPS API: 创建自定义任务面板
            var taskPane = Application.TaskPanes.Add("CodeYang AI", PANEL_URL, 350);
            panel = taskPane;
            isOpen = true;

            // 监听面板关闭事件
            taskPane.OnClose = function() {
                isOpen = false;
                panel = null;
            };
        } catch (e) {
            // 降级方案: 使用对话框
            try {
                var dlg = Application.Dialogs.Add(400, 600);
                dlg.Title = "CodeYang AI";
                dlg.Url = PANEL_URL;
                dlg.Show();
            } catch (e2) {
                MsgBox("无法创建面板，请先启动 CodeYang Web 服务器:\nnode dist/web-server.js\n\n错误: " + e2.message, 48, "CodeYang");
            }
        }
    }

    // 关闭面板
    function closePanel() {
        if (panel) {
            try { panel.Close(); } catch(e) {}
            panel = null;
            isOpen = false;
        }
    }

    // 主入口
    if (Application.TaskPanes) {
        createPanel();
    } else {
        // 降级: 打开浏览器
        var wsh = new ActiveXObject("WScript.Shell");
        wsh.Run("cmd /c start " + PANEL_URL, 0, false);
    }
})();
