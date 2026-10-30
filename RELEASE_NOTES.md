# ADBVisualTool v0.1.0

Windows 桌面端可视化 ADB 工具，面向 Android 手工测试。

## 下载

- `ADBVisualTool Setup 0.1.0.exe`：NSIS 安装包
- `ADBVisualTool 0.1.0.exe`：便携版
- `ADBVisualTool-0.1.0-win64.zip`：以上两个文件 + 校验和 + 本说明

## 功能

- 设备识别、ADB 路径配置、Server 启停
- 实时 logcat、级别/Tag/关键字/PID 过滤、崩溃日志、当前应用日志
- 截图、scrcpy 录屏、独立窗口实时投屏（只看不控）
- Monkey 一键测试，报告/logcat/崩溃文件自动保存
- 应用列表、搜索、详情、安装/卸载/启停/清数据
- 文件浏览、上传/下载、新建目录、重命名、删除
- 终端、实时输出、命令历史、模板、强制终止、危险命令确认
- 设置、保存目录、版本信息、整体检查
- 系统托盘、右键菜单
- 配置原子写入，保留上一份有效备份；临时文件自动清理

## 安装

### 安装包

1. 将安装包放在英文路径；
2. 双击安装，默认安装到：
   `%LOCALAPPDATA%\Programs\ADBVisualTool`
3. 安装完成后从开始菜单/桌面快捷方式启动。

### 便携版

1. 将便携版放在英文路径；
2. 直接运行；
3. 不要放到中文目录下启动。

## 已知限制

- 打包版基于 Electron 45，**不要从中文目录直接运行**，否则可能启动崩溃；安装包默认路径为英文。
- 安装包未做代码签名，Windows SmartScreen 可能提示未知发布者。
- ADB 需要本机单独安装 platform-tools，不随包内置。
- 投屏是独立 scrcpy 窗口，只看不控。
- 终端强制终止会结束当前 adb shell；设备端已拉起的长时间任务不保证继续。

## 配置与数据

- 配置：`%APPDATA%\ADB工具箱\config.json`
- 备份：`%APPDATA%\ADB工具箱\config.json.bak`
- 默认日志：`文档\ADB工具箱\logs`
- 默认截图：`文档\ADB工具箱\screenshots`
- 默认录屏：`文档\ADB工具箱\records`
- 默认 Monkey：`文档\ADB工具箱\monkey`

程序不联网、不上传数据。

## 校验

见压缩包内 `SHA256SUMS.txt`。
