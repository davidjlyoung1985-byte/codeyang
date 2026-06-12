Attribute VB_Name = "CodeYangAI"
' CodeYang AI - WPS VBA 宏加载项
' 安装: WPS → 开发工具 → Visual Basic → 导入 → CodeYangAI.bas
' 使用: Alt+F8 → 运行 CodeYang_OpenPanel

' 打开 CodeYang 侧边栏
Public Sub CodeYang_OpenPanel()
    On Error Resume Next
    
    ' 方式1: 使用 WebBrowser 控件创建侧边栏
    Dim panel As Object
    Set panel = Application.CommandBars.Add("CodeYang", msoBarBottom, False, True)
    If Not panel Is Nothing Then
        panel.Visible = True
        panel.Width = 400
        
        ' 创建 Web 浏览器
        Dim webCtrl As Object
        Set webCtrl = Application.CommandBars("CodeYang").Controls.Add(msoControlActiveX, , , 1)
        If Not webCtrl Is Nothing Then
            webCtrl.Caption = "CodeYang AI"
            webCtrl.Visible = True
        End If
    End If
    
    ' 方式2: 使用 WPS 内置 Web 面板
    Dim url As String
    url = "http://localhost:3456/wps"
    
    ' 尝试用 Shell 打开浏览器（兼容所有版本）
    Call Shell("rundll32.exe url.dll,FileProtocolHandler " & url, vbHide)
    
    MsgBox "CodeYang AI 已启动" & vbCrLf & "浏览器已打开: " & url, vbInformation, "CodeYang"
End Sub

' 打开 WPS 适配版
Public Sub CodeYang_OpenInWps()
    On Error Resume Next
    
    ' 插入 Web 控件到当前文档
    Dim doc As Object
    Set doc = Application.ActiveDocument
    
    If Not doc Is Nothing Then
        ' 通过插入对象的方式嵌入 Web 页面
        Dim shp As Object
        Set shp = doc.Shapes.AddOLEControl("Shell.Explorer.2")
        If Not shp Is Nothing Then
            shp.Width = 400
            shp.Height = 600
            shp.Left = 0
            shp.Top = 0
            
            ' 导航到 CodeYang
            shp.Object.Navigate "http://localhost:3456/wps"
        End If
    End If
End Sub

' 关闭 CodeYang 面板
Public Sub CodeYang_ClosePanel()
    On Error Resume Next
    Application.CommandBars("CodeYang").Delete
End Sub
